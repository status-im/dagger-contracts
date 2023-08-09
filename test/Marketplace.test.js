const { ethers } = require("hardhat")
const { AddressZero, hexlify, randomBytes } = ethers
const { expect } = require("chai")
const { exampleConfiguration, exampleRequest } = require("./examples")
const { periodic, hours } = require("./time")
const { requestId, slotId, askToArray } = require("./ids")
const {
  RequestState,
  SlotState,
  enableRequestAssertions,
} = require("./requests")
const {
  waitUntilCancelled,
  waitUntilStarted,
  waitUntilFinished,
  waitUntilFailed,
  waitUntilSlotFailed,
} = require("./marketplace")
const { price, pricePerSlot } = require("./price")
const {
  snapshot,
  revert,
  mine,
  ensureMinimumBlockHeight,
  advanceTime,
  advanceTimeTo,
  currentTime,
} = require("./evm")

describe("Marketplace constructor", function () {
  let Marketplace, token, config

  beforeEach(async function () {
    await snapshot()
    await ensureMinimumBlockHeight(256)

    const TestToken = await ethers.getContractFactory("TestToken")
    token = await TestToken.deploy()

    Marketplace = await ethers.getContractFactory("TestMarketplace")
    config = exampleConfiguration()
  })

  afterEach(async function () {
    await revert()
  })

  function testPercentageOverflow(property) {
    it(`should reject for ${property} overflowing percentage values`, async () => {
      config.collateral[property] = 101

      await expect(
        Marketplace.deploy(token.address, config)
      ).to.be.revertedWith("Must be less than 100")
    })
  }

  testPercentageOverflow("repairRewardPercentage")
  testPercentageOverflow("slashPercentage")

  it("should reject when total slash percentage exceeds 100%", async () => {
    config.collateral.slashPercentage = 1
    config.collateral.maxNumberOfSlashes = 101

    await expect(Marketplace.deploy(token.address, config)).to.be.revertedWith(
      "Maximum slashing exceeds 100%"
    )
  })
})

describe("Marketplace", function () {
  const proof = hexlify(randomBytes(42))
  const config = exampleConfiguration()

  let marketplace
  let token
  let client, host, host1, host2, host3
  let request
  let slot

  enableRequestAssertions()

  beforeEach(async function () {
    await snapshot()
    await ensureMinimumBlockHeight(256)
    ;[client, host1, host2, host3] = await ethers.getSigners()
    host = host1

    const TestToken = await ethers.getContractFactory("TestToken")
    token = await TestToken.deploy()
    for (account of [client, host1, host2, host3]) {
      await token.mint(account.address, 1_000_000_000)
    }

    const Marketplace = await ethers.getContractFactory("TestMarketplace")
    marketplace = await Marketplace.deploy(token.address, config)

    request = await exampleRequest()
    request.client = client.address

    slot = {
      request: requestId(request),
      index: request.ask.slots / 2,
    }
  })

  afterEach(async function () {
    await revert()
  })

  function switchAccount(account) {
    token = token.connect(account)
    marketplace = marketplace.connect(account)
  }

  describe("requesting storage", function () {
    beforeEach(function () {
      switchAccount(client)
    })

    it("emits event when storage is requested", async function () {
      await token.approve(marketplace.address, price(request))
      await expect(marketplace.requestStorage(request))
        .to.emit(marketplace, "StorageRequested")
        .withArgs(requestId(request), askToArray(request.ask), request.expiry)
    })

    it("allows retrieval of request details", async function () {
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(request)
      const id = requestId(request)
      expect(await marketplace.getRequest(id)).to.be.request(request)
    })

    it("rejects request with invalid client address", async function () {
      let invalid = { ...request, client: host.address }
      await token.approve(marketplace.address, price(invalid))
      await expect(marketplace.requestStorage(invalid)).to.be.revertedWith(
        "Invalid client address"
      )
    })

    it("rejects request with insufficient payment", async function () {
      let insufficient = price(request) - 1
      await token.approve(marketplace.address, insufficient)
      await expect(marketplace.requestStorage(request)).to.be.revertedWith(
        "ERC20: insufficient allowance"
      )
    })

    it("rejects resubmission of request", async function () {
      await token.approve(marketplace.address, price(request) * 2)
      await marketplace.requestStorage(request)
      await expect(marketplace.requestStorage(request)).to.be.revertedWith(
        "Request already exists"
      )
    })
  })

  describe("filling a slot with collateral", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(marketplace.address, request.ask.collateral)
    })

    it("emits event when slot is filled", async function () {
      await expect(marketplace.fillSlot(slot.request, slot.index, proof))
        .to.emit(marketplace, "SlotFilled")
        .withArgs(slot.request, slot.index)
    })

    it("allows retrieval of host that filled slot", async function () {
      expect(await marketplace.getHost(slotId(slot))).to.equal(AddressZero)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      expect(await marketplace.getHost(slotId(slot))).to.equal(host.address)
    })

    it("fails to retrieve a request of an empty slot", async function () {
      expect(marketplace.getActiveSlot(slotId(slot))).to.be.revertedWith(
        "Slot is free"
      )
    })

    it("allows retrieval of request of a filled slot", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      let activeSlot = await marketplace.getActiveSlot(slotId(slot))
      expect(activeSlot.request).to.be.request(request)
      expect(activeSlot.slotIndex).to.equal(slot.index)
    })

    it("is rejected when proof is incorrect", async function () {
      let invalid = hexlify([])
      await expect(
        marketplace.fillSlot(slot.request, slot.index, invalid)
      ).to.be.revertedWith("Invalid proof")
    })

    it("is rejected when slot already filled", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await expect(
        marketplace.fillSlot(slot.request, slot.index, proof)
      ).to.be.revertedWith("Slot is not free")
    })

    it("is rejected when request is unknown", async function () {
      let unknown = await exampleRequest()
      await expect(
        marketplace.fillSlot(requestId(unknown), 0, proof)
      ).to.be.revertedWith("Unknown request")
    })

    it("is rejected when request is cancelled", async function () {
      switchAccount(client)
      let expired = { ...request, expiry: (await currentTime()) - hours(1) }
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(expired)
      switchAccount(host)
      await expect(
        marketplace.fillSlot(requestId(expired), slot.index, proof)
      ).to.be.revertedWith("Slot is not free")
    })

    it("is rejected when request is finished", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, slot.request)
      await expect(
        marketplace.fillSlot(slot.request, slot.index, proof)
      ).to.be.revertedWith("Slot is not free")
    })

    it("is rejected when request is failed", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFailed(marketplace, request)
      await expect(
        marketplace.fillSlot(slot.request, slot.index, proof)
      ).to.be.revertedWith("Slot is not free")
    })

    it("is rejected when slot index not in range", async function () {
      const invalid = request.ask.slots
      await expect(
        marketplace.fillSlot(slot.request, invalid, proof)
      ).to.be.revertedWith("Invalid slot")
    })

    it("fails when all slots are already filled", async function () {
      const lastSlot = request.ask.slots - 1
      await token.approve(
        marketplace.address,
        request.ask.collateral * lastSlot
      )
      await token.approve(marketplace.address, price(request) * lastSlot)
      for (let i = 0; i <= lastSlot; i++) {
        await marketplace.fillSlot(slot.request, i, proof)
      }
      await expect(
        marketplace.fillSlot(slot.request, lastSlot, proof)
      ).to.be.revertedWith("Slot is not free")
    })
  })

  describe("filling slot without collateral", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
    })

    it("is rejected when approved collateral is insufficient", async function () {
      let insufficient = request.ask.collateral - 1
      await token.approve(marketplace.address, insufficient)
      await expect(
        marketplace.fillSlot(slot.request, slot.index, proof)
      ).to.be.revertedWith("ERC20: insufficient allowance")
    })

    it("collects only requested collateral and not more", async function () {
      await token.approve(marketplace.address, request.ask.collateral * 2)
      const startBalanace = await token.balanceOf(host.address)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      const endBalance = await token.balanceOf(host.address)
      expect(startBalanace - endBalance).to.eq(request.ask.collateral)
    })
  })

  describe("request end", function () {
    var requestTime
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(request)
      requestTime = await currentTime()
      switchAccount(host)
      await token.approve(marketplace.address, request.ask.collateral)
    })

    it("sets the request end time to now + duration", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await expect(
        (await marketplace.requestEnd(requestId(request))).toNumber()
      ).to.be.closeTo(requestTime + request.ask.duration, 1)
    })

    it("sets request end time to the past once failed", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFailed(marketplace, request)
      let slot0 = { ...slot, index: request.ask.maxSlotLoss + 1 }
      const now = await currentTime()
      await expect(await marketplace.requestEnd(requestId(request))).to.be.eq(
        now - 1
      )
    })

    it("sets request end time to the past once cancelled", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilCancelled(request)
      const now = await currentTime()
      await expect(await marketplace.requestEnd(requestId(request))).to.be.eq(
        now - 1
      )
    })

    it("checks that request end time is in the past once finished", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, requestId(request))
      const now = await currentTime()
      // in the process of calling currentTime and requestEnd,
      // block.timestamp has advanced by 1, so the expected proof end time will
      // be block.timestamp - 1.
      await expect(await marketplace.requestEnd(requestId(request))).to.be.eq(
        now - 1
      )
    })
  })

  describe("freeing a slot", function () {
    let id

    beforeEach(async function () {
      slot.index = 0
      id = slotId(slot)

      switchAccount(client)
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(marketplace.address, request.ask.collateral)
    })

    it("fails to free slot when slot not filled", async function () {
      slot.index = 5
      let nonExistentId = slotId(slot)
      await expect(marketplace.freeSlot(nonExistentId)).to.be.revertedWith(
        "Slot is free"
      )
    })

    it("can only be freed by the host occupying the slot", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      switchAccount(client)
      await expect(marketplace.freeSlot(id)).to.be.revertedWith(
        "Slot filled by other host"
      )
    })

    it("successfully frees slot", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await expect(marketplace.freeSlot(id)).not.to.be.reverted
    })

    it("emits event once slot is freed", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await expect(await marketplace.freeSlot(id))
        .to.emit(marketplace, "SlotFreed")
        .withArgs(slot.request, slot.index)
    })
  })

  describe("paying out a slot", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(marketplace.address, request.ask.collateral)
    })

    it("pays the host when contract has finished and returns collateral", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, requestId(request))
      const startBalance = await token.balanceOf(host.address)
      await marketplace.freeSlot(slotId(slot))
      const endBalance = await token.balanceOf(host.address)
      expect(endBalance - startBalance).to.equal(
        pricePerSlot(request) + request.ask.collateral
      )
    })

    it("pays the host when contract was cancelled", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilCancelled(request)
      const startBalance = await token.balanceOf(host.address)
      await marketplace.freeSlot(slotId(slot))
      const endBalance = await token.balanceOf(host.address)
      expect(endBalance).to.be.gt(startBalance)
    })

    it("does not pay when the contract hasn't ended", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      const startBalance = await token.balanceOf(host.address)
      await marketplace.freeSlot(slotId(slot))
      const endBalance = await token.balanceOf(host.address)
      expect(endBalance).to.equal(startBalance)
    })

    it("can only be done once", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, requestId(request))
      await marketplace.freeSlot(slotId(slot))
      await expect(marketplace.freeSlot(slotId(slot))).to.be.revertedWith(
        "Already paid"
      )
    })

    it("cannot be filled again", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, requestId(request))
      await marketplace.freeSlot(slotId(slot))
      await expect(marketplace.fillSlot(slot.request, slot.index, proof)).to.be
        .reverted
    })
  })

  describe("fulfilling a request", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(marketplace.address, request.ask.collateral)
    })

    it("emits event when all slots are filled", async function () {
      const lastSlot = request.ask.slots - 1
      await token.approve(
        marketplace.address,
        request.ask.collateral * lastSlot
      )
      for (let i = 0; i < lastSlot; i++) {
        await marketplace.fillSlot(slot.request, i, proof)
      }

      await token.approve(marketplace.address, request.ask.collateral)
      await expect(marketplace.fillSlot(slot.request, lastSlot, proof))
        .to.emit(marketplace, "RequestFulfilled")
        .withArgs(requestId(request))
    })
    it("sets state when all slots are filled", async function () {
      const slots = request.ask.slots
      await token.approve(marketplace.address, request.ask.collateral * slots)
      for (let i = 0; i < slots; i++) {
        await marketplace.fillSlot(slot.request, i, proof)
      }
      await expect(await marketplace.requestState(slot.request)).to.equal(
        RequestState.Started
      )
    })
    it("fails when all slots are already filled", async function () {
      const lastSlot = request.ask.slots - 1
      await token.approve(
        marketplace.address,
        request.ask.collateral * (lastSlot + 1)
      )
      for (let i = 0; i <= lastSlot; i++) {
        await marketplace.fillSlot(slot.request, i, proof)
      }
      await expect(
        marketplace.fillSlot(slot.request, lastSlot, proof)
      ).to.be.revertedWith("Slot is not free")
    })
  })

  describe("withdrawing funds", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(marketplace.address, request.ask.collateral)
    })

    it("rejects withdraw when request not yet timed out", async function () {
      switchAccount(client)
      await expect(marketplace.withdrawFunds(slot.request)).to.be.revertedWith(
        "Request not yet timed out"
      )
    })

    it("rejects withdraw when wrong account used", async function () {
      await waitUntilCancelled(request)
      await expect(marketplace.withdrawFunds(slot.request)).to.be.revertedWith(
        "Invalid client address"
      )
    })

    it("rejects withdraw when in wrong state", async function () {
      // fill all slots, should change state to RequestState.Started
      const lastSlot = request.ask.slots - 1
      await token.approve(
        marketplace.address,
        request.ask.collateral * (lastSlot + 1)
      )
      for (let i = 0; i <= lastSlot; i++) {
        await marketplace.fillSlot(slot.request, i, proof)
      }
      await waitUntilCancelled(request)
      switchAccount(client)
      await expect(marketplace.withdrawFunds(slot.request)).to.be.revertedWith(
        "Invalid state"
      )
    })

    it("emits event once request is cancelled", async function () {
      await waitUntilCancelled(request)
      switchAccount(client)
      await expect(marketplace.withdrawFunds(slot.request))
        .to.emit(marketplace, "RequestCancelled")
        .withArgs(requestId(request))
    })

    it("withdraws to the client", async function () {
      await waitUntilCancelled(request)
      switchAccount(client)
      const startBalance = await token.balanceOf(client.address)
      await marketplace.withdrawFunds(slot.request)
      const endBalance = await token.balanceOf(client.address)
      expect(endBalance - startBalance).to.equal(price(request))
    })
  })

  describe("request state", function () {
    const { New, Cancelled, Started, Failed, Finished } = RequestState

    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(marketplace.address, request.ask.collateral)
    })

    it("is 'New' initially", async function () {
      expect(await marketplace.requestState(slot.request)).to.equal(New)
    })

    it("changes to 'Cancelled' once request is cancelled", async function () {
      await waitUntilCancelled(request)
      expect(await marketplace.requestState(slot.request)).to.equal(Cancelled)
    })

    it("remains 'Cancelled' when client withdraws funds", async function () {
      await waitUntilCancelled(request)
      switchAccount(client)
      await marketplace.withdrawFunds(slot.request)
      expect(await marketplace.requestState(slot.request)).to.equal(Cancelled)
    })

    it("changes to 'Started' once all slots are filled", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      expect(await marketplace.requestState(slot.request)).to.equal(Started)
    })

    it("changes to 'Failed' once too many slots are freed", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFailed(marketplace, request)
      expect(await marketplace.requestState(slot.request)).to.equal(Failed)
    })

    it("does not change to 'Failed' before it is started", async function () {
      await token.approve(
        marketplace.address,
        request.ask.collateral * (request.ask.maxSlotLoss + 1)
      )
      for (let i = 0; i <= request.ask.maxSlotLoss; i++) {
        await marketplace.fillSlot(slot.request, i, proof)
      }
      for (let i = 0; i <= request.ask.maxSlotLoss; i++) {
        slot.index = i
        let id = slotId(slot)
        await marketplace.forciblyFreeSlot(id)
      }
      expect(await marketplace.requestState(slot.request)).to.equal(New)
    })

    it("changes to 'Finished' when the request ends", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, requestId(request))
      expect(await marketplace.requestState(slot.request)).to.equal(Finished)
    })

    it("remains 'Finished' once a slot is paid out", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, requestId(request))
      await marketplace.freeSlot(slotId(slot))
      expect(await marketplace.requestState(slot.request)).to.equal(Finished)
    })
  })

  describe("slot state", function () {
    const { Free, Filled, Finished, Failed, Paid } = SlotState
    let period, periodEnd

    beforeEach(async function () {
      period = config.proofs.period
      ;({ periodOf, periodEnd } = periodic(period))

      switchAccount(client)
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(marketplace.address, request.ask.collateral)
    })

    async function waitUntilProofIsRequired(id) {
      await advanceTimeTo(periodEnd(periodOf(await currentTime())))
      while (
        !(
          (await marketplace.isProofRequired(id)) &&
          (await marketplace.getPointer(id)) < 250
        )
      ) {
        await advanceTime(period)
      }
    }

    it("is 'Free' initially", async function () {
      expect(await marketplace.slotState(slotId(slot))).to.equal(Free)
    })

    it("changes to 'Filled' when slot is filled", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      expect(await marketplace.slotState(slotId(slot))).to.equal(Filled)
    })

    it("changes to 'Finished' when request finishes", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, slot.request)
      expect(await marketplace.slotState(slotId(slot))).to.equal(Finished)
    })

    it("changes to 'Finished' when request is cancelled", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilCancelled(request)
      expect(await marketplace.slotState(slotId(slot))).to.equal(Finished)
    })

    it("changes to 'Free' when host frees the slot", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await marketplace.freeSlot(slotId(slot))
      expect(await marketplace.slotState(slotId(slot))).to.equal(Free)
    })

    it("changes to 'Free' when too many proofs are missed", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      while ((await marketplace.slotState(slotId(slot))) === Filled) {
        await waitUntilProofIsRequired(slotId(slot))
        const missedPeriod = periodOf(await currentTime())
        await advanceTime(period)
        await marketplace.markProofAsMissing(slotId(slot), missedPeriod)
      }
      expect(await marketplace.slotState(slotId(slot))).to.equal(Free)
    })

    it("changes to 'Failed' when request fails", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilSlotFailed(marketplace, request, slot)
      expect(await marketplace.slotState(slotId(slot))).to.equal(Failed)
    })

    it("changes to 'Paid' when host has been paid", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, slot.request)
      await marketplace.freeSlot(slotId(slot))
      expect(await marketplace.slotState(slotId(slot))).to.equal(Paid)
    })
  })

  describe("proof requirements", function () {
    let period, periodOf, periodEnd

    beforeEach(async function () {
      period = config.proofs.period
      ;({ periodOf, periodEnd } = periodic(period))

      switchAccount(client)
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(marketplace.address, request.ask.collateral)
    })

    async function waitUntilProofWillBeRequired(id) {
      while (!(await marketplace.willProofBeRequired(id))) {
        await mine()
      }
    }

    async function waitUntilProofIsRequired(id) {
      await advanceTimeTo(periodEnd(periodOf(await currentTime())))
      while (
        !(
          (await marketplace.isProofRequired(id)) &&
          (await marketplace.getPointer(id)) < 250
        )
      ) {
        await advanceTime(period)
      }
    }

    it("requires proofs when slot is filled", async function () {
      const id = slotId(slot)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilProofWillBeRequired(id)
    })

    it("will not require proofs once cancelled", async function () {
      const id = slotId(slot)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilProofWillBeRequired(id)
      await expect(await marketplace.willProofBeRequired(id)).to.be.true
      await advanceTimeTo(request.expiry + 1)
      await expect(await marketplace.willProofBeRequired(id)).to.be.false
    })

    it("does not require proofs once cancelled", async function () {
      const id = slotId(slot)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilProofIsRequired(id)
      await expect(await marketplace.isProofRequired(id)).to.be.true
      await advanceTimeTo(request.expiry + 1)
      await expect(await marketplace.isProofRequired(id)).to.be.false
    })

    it("does not provide challenges once cancelled", async function () {
      const id = slotId(slot)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilProofIsRequired(id)
      const challenge1 = await marketplace.getChallenge(id)
      expect(BigInt(challenge1) > 0n)
      await advanceTimeTo(request.expiry + 1)
      const challenge2 = await marketplace.getChallenge(id)
      expect(BigInt(challenge2) === 0n)
    })

    it("does not provide pointer once cancelled", async function () {
      const id = slotId(slot)
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilProofIsRequired(id)
      const challenge1 = await marketplace.getChallenge(id)
      expect(BigInt(challenge1) > 0n)
      await advanceTimeTo(request.expiry + 1)
      const challenge2 = await marketplace.getChallenge(id)
      expect(BigInt(challenge2) === 0n)
    })
  })

  describe("missing proofs", function () {
    let period, periodOf, periodEnd

    beforeEach(async function () {
      period = config.proofs.period
      ;({ periodOf, periodEnd } = periodic(period))

      switchAccount(client)
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(marketplace.address, request.ask.collateral)
    })

    async function waitUntilProofIsRequired(id) {
      await advanceTimeTo(periodEnd(periodOf(await currentTime())))
      while (
        !(
          (await marketplace.isProofRequired(id)) &&
          (await marketplace.getPointer(id)) < 250
        )
      ) {
        await advanceTime(period)
      }
    }

    it("fails to mark proof as missing when cancelled", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilCancelled(request)
      let missedPeriod = periodOf(await currentTime())
      await expect(
        marketplace.markProofAsMissing(slotId(slot), missedPeriod)
      ).to.be.revertedWith("Slot not accepting proofs")
    })

    describe("slashing when missing proofs", function () {
      it("reduces collateral when too many proofs are missing", async function () {
        const id = slotId(slot)
        const { slashCriterion, slashPercentage } = config.collateral
        await marketplace.fillSlot(slot.request, slot.index, proof)
        for (let i = 0; i < slashCriterion; i++) {
          await waitUntilProofIsRequired(id)
          let missedPeriod = periodOf(await currentTime())
          await advanceTime(period)
          await marketplace.markProofAsMissing(id, missedPeriod)
        }
        const expectedBalance =
          (request.ask.collateral * (100 - slashPercentage)) / 100

        expect(
          BigInt(expectedBalance) === await marketplace.getSlotCollateral(id)
        )
      })
    })

    it("frees slot when collateral slashed below minimum threshold", async function () {
      const minimum =
        request.ask.collateral -
        (request.ask.collateral *
          config.collateral.maxNumberOfSlashes *
          config.collateral.slashPercentage) /
          100
      await waitUntilStarted(marketplace, request, proof, token)
      while ((await marketplace.slotState(slotId(slot))) === SlotState.Filled) {
        expect(await marketplace.getSlotCollateral(slotId(slot))).to.be.gt(
          minimum
        )
        await waitUntilProofIsRequired(slotId(slot))
        const missedPeriod = periodOf(await currentTime())
        await advanceTime(period)
        await marketplace.markProofAsMissing(slotId(slot), missedPeriod)
      }
      expect(await marketplace.slotState(slotId(slot))).to.equal(SlotState.Free)
      expect(await marketplace.getSlotCollateral(slotId(slot))).to.be.lte(
        minimum
      )
    })

    it("free slot when minimum reached and resets missed proof counter", async function () {
      const minimum =
        request.ask.collateral -
        (request.ask.collateral *
          config.collateral.maxNumberOfSlashes *
          config.collateral.slashPercentage) /
          100
      await waitUntilStarted(marketplace, request, proof, token)
      let missedProofs = 0
      while ((await marketplace.slotState(slotId(slot))) === SlotState.Filled) {
        expect(await marketplace.getSlotCollateral(slotId(slot))).to.be.gt(
          minimum
        )
        await waitUntilProofIsRequired(slotId(slot))
        const missedPeriod = periodOf(await currentTime())
        await advanceTime(period)
        expect(await marketplace.missingProofs(slotId(slot))).to.equal(
          missedProofs
        )
        await marketplace.markProofAsMissing(slotId(slot), missedPeriod)
        missedProofs += 1
      }
      expect(await marketplace.slotState(slotId(slot))).to.equal(SlotState.Free)
      expect(await marketplace.missingProofs(slotId(slot))).to.equal(0)
      expect(await marketplace.getSlotCollateral(slotId(slot))).to.be.lte(
        minimum
      )
    })
  })

  describe("list of active requests", function () {
    beforeEach(async function () {
      switchAccount(host)
      await token.approve(marketplace.address, request.ask.collateral)
      switchAccount(client)
      await token.approve(marketplace.address, price(request))
    })

    it("adds request to list when requesting storage", async function () {
      await marketplace.requestStorage(request)
      expect(await marketplace.myRequests()).to.deep.equal([requestId(request)])
    })

    it("keeps request in list when cancelled", async function () {
      await marketplace.requestStorage(request)
      await waitUntilCancelled(request)
      expect(await marketplace.myRequests()).to.deep.equal([requestId(request)])
    })

    it("removes request from list when funds are withdrawn", async function () {
      await marketplace.requestStorage(request)
      await waitUntilCancelled(request)
      await marketplace.withdrawFunds(requestId(request))
      expect(await marketplace.myRequests()).to.deep.equal([])
    })

    it("keeps request in list when request fails", async function () {
      await marketplace.requestStorage(request)
      switchAccount(host)
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFailed(marketplace, request)
      switchAccount(client)
      expect(await marketplace.myRequests()).to.deep.equal([requestId(request)])
    })

    it("removes request from list when request finishes", async function () {
      await marketplace.requestStorage(request)
      switchAccount(host)
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, requestId(request))
      await marketplace.freeSlot(slotId(slot))
      switchAccount(client)
      expect(await marketplace.myRequests()).to.deep.equal([])
    })
  })

  describe("list of active slots", function () {
    beforeEach(async function () {
      switchAccount(client)
      await token.approve(marketplace.address, price(request))
      await marketplace.requestStorage(request)
      switchAccount(host)
      await token.approve(marketplace.address, request.ask.collateral)
    })

    it("adds slot to list when filling slot", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      let slot1 = { ...slot, index: slot.index + 1 }
      await token.approve(marketplace.address, request.ask.collateral)
      await marketplace.fillSlot(slot.request, slot1.index, proof)
      expect(await marketplace.mySlots()).to.have.members([
        slotId(slot),
        slotId(slot1),
      ])
    })

    it("removes slot from list when slot is freed", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      let slot1 = { ...slot, index: slot.index + 1 }
      await token.approve(marketplace.address, request.ask.collateral)
      await marketplace.fillSlot(slot.request, slot1.index, proof)
      await token.approve(marketplace.address, request.ask.collateral)
      await marketplace.freeSlot(slotId(slot))
      expect(await marketplace.mySlots()).to.have.members([slotId(slot1)])
    })

    it("keeps slots when cancelled", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      let slot1 = { ...slot, index: slot.index + 1 }

      await token.approve(marketplace.address, request.ask.collateral)
      await marketplace.fillSlot(slot.request, slot1.index, proof)
      await waitUntilCancelled(request)
      expect(await marketplace.mySlots()).to.have.members([
        slotId(slot),
        slotId(slot1),
      ])
    })

    it("removes slot when finished slot is freed", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilFinished(marketplace, requestId(request))
      await marketplace.freeSlot(slotId(slot))
      expect(await marketplace.mySlots()).to.not.contain(slotId(slot))
    })

    it("removes slot when cancelled slot is freed", async function () {
      await marketplace.fillSlot(slot.request, slot.index, proof)
      await waitUntilCancelled(request)
      await marketplace.freeSlot(slotId(slot))
      expect(await marketplace.mySlots()).to.not.contain(slotId(slot))
    })

    it("removes slot when failed slot is freed", async function () {
      await waitUntilStarted(marketplace, request, proof, token)
      await waitUntilSlotFailed(marketplace, request, slot)
      await marketplace.freeSlot(slotId(slot))
      expect(await marketplace.mySlots()).to.not.contain(slotId(slot))
    })
  })
})
