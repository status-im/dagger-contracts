const { expect } = require("chai")
const { ethers, deployments } = require("hardhat")
const { hexlify, randomBytes } = ethers.utils
const {
  snapshot,
  revert,
  mine,
  ensureMinimumBlockHeight,
  currentTime,
  advanceTimeForNextBlock,
  advanceTimeToForNextBlock,
} = require("./evm")
const { periodic } = require("./time")
const { loadProof, loadPublicInput } = require("../verifier/verifier")
const { SlotState } = require("./requests")
const binomialTest = require("@stdlib/stats-binomial-test")
const { exampleProof } = require("./examples")

describe("Proofs", function () {
  const slotId = hexlify(randomBytes(32))
  const period = 30 * 60
  const timeout = 5
  const downtime = 64
  const probability = 4 // require a proof roughly once every 4 periods
  const downtimeProduct = 67
  const { periodOf, periodEnd } = periodic(period)

  let proofs

  beforeEach(async function () {
    await snapshot()
    await ensureMinimumBlockHeight(256)
    const Proofs = await ethers.getContractFactory("TestProofs")
    await deployments.fixture(["Verifier"])
    const verifier = await deployments.get("Groth16Verifier")
    proofs = await Proofs.deploy(
      { period, timeout, downtime, zkeyHash: "", downtimeProduct },
      verifier.address
    )
  })

  afterEach(async function () {
    await revert()
  })

  describe("general", function () {
    beforeEach(async function () {
      await proofs.setSlotState(slotId, SlotState.Filled)
    })

    it("requires proofs with an agreed upon probability", async function () {
      const samples = 256 // 256 samples avoids bias due to pointer downtime

      await proofs.startRequiringProofs(slotId, probability)
      await advanceTimeForNextBlock(period)
      await mine()
      let amount = 0
      for (let i = 0; i < samples; i++) {
        if (await proofs.isProofRequired(slotId)) {
          amount += 1
        }
        await advanceTimeForNextBlock(period)
        await mine()
      }

      const p = 1 / probability // expected probability
      const alpha = 1 / 1000 // unit test can fail once every 1000 runs

      // use binomial test to check that the measured amount is likely to occur
      expect(binomialTest(amount, samples, { p, alpha }).rejected).to.be.false
    })

    it("supports probability 1 (proofs are always required)", async function () {
      await proofs.startRequiringProofs(slotId, 1)
      await advanceTimeForNextBlock(period)
      await mine()
      while ((await proofs.getPointer(slotId)) < downtime) {
        await mine()
      }
      expect(await proofs.isProofRequired(slotId)).to.be.true
    })

    it("requires no proofs in the start period", async function () {
      const startPeriod = Math.floor((await currentTime()) / period)
      const probability = 1
      await proofs.startRequiringProofs(slotId, probability)
      while (Math.floor((await currentTime()) / period) == startPeriod) {
        expect(await proofs.isProofRequired(slotId)).to.be.false
        await advanceTimeForNextBlock(Math.floor(period / 10))
        await mine()
      }
    })

    it("requires proofs for different ids at different times", async function () {
      let id1 = hexlify(randomBytes(32))
      let id2 = hexlify(randomBytes(32))
      let id3 = hexlify(randomBytes(32))
      for (let slotId of [id1, id2, id3]) {
        await proofs.setSlotState(slotId, SlotState.Filled)
        await proofs.startRequiringProofs(slotId, probability)
      }
      let req1, req2, req3
      while (req1 === req2 && req2 === req3) {
        req1 = await proofs.isProofRequired(id1)
        req2 = await proofs.isProofRequired(id2)
        req3 = await proofs.isProofRequired(id3)
        await advanceTimeForNextBlock(period)
        await mine()
      }
    })

    it("moves pointer one block at a time", async function () {
      await advanceTimeToForNextBlock(periodEnd(periodOf(await currentTime())))
      await mine()
      for (let i = 0; i < 256; i++) {
        let previous = await proofs.getPointer(slotId)
        await mine()
        let current = await proofs.getPointer(slotId)
        expect(current).to.equal((previous + 1) % 256)
      }
    })
  })

  describe("when proof requirement is upcoming", function () {
    async function waitUntilProofWillBeRequired() {
      while (!(await proofs.willProofBeRequired(slotId))) {
        await mine()
      }
    }

    beforeEach(async function () {
      await proofs.setSlotState(slotId, SlotState.Filled)
      await proofs.startRequiringProofs(slotId, probability)
      await advanceTimeToForNextBlock(periodEnd(periodOf(await currentTime())))
      await waitUntilProofWillBeRequired()
    })

    it("means the pointer is in downtime", async function () {
      expect(await proofs.getPointer(slotId)).to.be.lt(downtime)
      while ((await proofs.getPointer(slotId)) < downtime) {
        expect(await proofs.willProofBeRequired(slotId)).to.be.true
        await mine()
      }
    })

    it("means that a proof is required after downtime", async function () {
      while ((await proofs.getPointer(slotId)) < downtime) {
        await mine()
      }
      expect(await proofs.willProofBeRequired(slotId)).to.be.false
      expect(await proofs.isProofRequired(slotId)).to.be.true
    })

    it("will not require proofs when slot is finished", async function () {
      expect(await proofs.getPointer(slotId)).to.be.lt(downtime)
      expect(await proofs.willProofBeRequired(slotId)).to.be.true
      await proofs.setSlotState(slotId, SlotState.Finished)
      expect(await proofs.willProofBeRequired(slotId)).to.be.false
    })
  })

  describe("when proofs are required", function () {
    const proof = loadProof("hardhat")
    const pubSignals = loadPublicInput("hardhat")

    beforeEach(async function () {
      await proofs.setSlotState(slotId, SlotState.Filled)
      await proofs.startRequiringProofs(slotId, probability)
    })

    async function waitUntilProofIsRequired(slotId) {
      await advanceTimeToForNextBlock(periodEnd(periodOf(await currentTime())))
      await mine()

      while (
        !(
          (await proofs.isProofRequired(slotId)) &&
          (await proofs.getPointer(slotId)) < 250
        )
      ) {
        await advanceTimeForNextBlock(period)
        await mine()
      }
    }

    it("provides different challenges per period", async function () {
      await waitUntilProofIsRequired(slotId)
      const challenge1 = await proofs.getChallenge(slotId)
      await waitUntilProofIsRequired(slotId)
      const challenge2 = await proofs.getChallenge(slotId)
      expect(challenge2).not.to.equal(challenge1)
    })

    it("provides different challenges per slotId", async function () {
      const id2 = hexlify(randomBytes(32))
      const id3 = hexlify(randomBytes(32))
      const challenge1 = await proofs.getChallenge(slotId)
      const challenge2 = await proofs.getChallenge(id2)
      const challenge3 = await proofs.getChallenge(id3)
      expect(challenge1 === challenge2 && challenge2 === challenge3).to.be.false
    })

    it("handles a correct proof", async function () {
      await proofs.proofReceived(slotId, proof, pubSignals)
    })

    it("fails proof submission when proof is incorrect", async function () {
      let invalid = exampleProof()
      await expect(
        proofs.proofReceived(slotId, invalid, pubSignals)
      ).to.be.revertedWith("Proofs_InvalidProof")
    })

    it("fails proof submission when public input is incorrect", async function () {
      let invalid = [1, 2, 3]
      await expect(
        proofs.proofReceived(slotId, proof, invalid)
      ).to.be.revertedWith("Proofs_InvalidProof")
    })

    it("emits an event when proof was submitted", async function () {
      await expect(proofs.proofReceived(slotId, proof, pubSignals))
        .to.emit(proofs, "ProofSubmitted")
        .withArgs(slotId)
    })

    it("fails proof submission when already submitted", async function () {
      await advanceTimeToForNextBlock(periodEnd(periodOf(await currentTime())))
      await proofs.proofReceived(slotId, proof, pubSignals)
      await expect(
        proofs.proofReceived(slotId, proof, pubSignals)
      ).to.be.revertedWith("Proofs_ProofAlreadySubmitted")
    })

    it("marks a proof as missing", async function () {
      expect(await proofs.missingProofs(slotId)).to.equal(0)
      await waitUntilProofIsRequired(slotId)
      let missedPeriod = periodOf(await currentTime())
      await advanceTimeToForNextBlock(periodEnd(missedPeriod))
      await mine()
      await proofs.markProofAsMissing(slotId, missedPeriod)
      expect(await proofs.missingProofs(slotId)).to.equal(1)
    })

    it("does not mark a proof as missing before period end", async function () {
      await waitUntilProofIsRequired(slotId)
      let currentPeriod = periodOf(await currentTime())
      await expect(
        proofs.markProofAsMissing(slotId, currentPeriod)
      ).to.be.revertedWith("Proofs_PeriodNotEnded")
    })

    it("does not mark a proof as missing after timeout", async function () {
      await waitUntilProofIsRequired(slotId)
      let currentPeriod = periodOf(await currentTime())
      await advanceTimeToForNextBlock(periodEnd(currentPeriod) + timeout)
      await expect(
        proofs.markProofAsMissing(slotId, currentPeriod)
      ).to.be.revertedWith("Proofs_ValidationTimedOut")
    })

    it("does not mark a received proof as missing", async function () {
      await waitUntilProofIsRequired(slotId)
      let receivedPeriod = periodOf(await currentTime())
      await proofs.proofReceived(slotId, proof, pubSignals)
      await advanceTimeToForNextBlock(periodEnd(receivedPeriod))
      await mine()
      await expect(
        proofs.markProofAsMissing(slotId, receivedPeriod)
      ).to.be.revertedWith("Proofs_ProofNotMissing")
    })

    it("does not mark proof as missing when not required", async function () {
      while (await proofs.isProofRequired(slotId)) {
        await advanceTimeForNextBlock(period)
        await mine()
      }
      let currentPeriod = periodOf(await currentTime())
      await advanceTimeToForNextBlock(periodEnd(currentPeriod))
      await mine()
      await expect(
        proofs.markProofAsMissing(slotId, currentPeriod)
      ).to.be.revertedWith("Proofs_ProofNotRequired")
    })

    it("does not mark proof as missing twice", async function () {
      await waitUntilProofIsRequired(slotId)
      let missedPeriod = periodOf(await currentTime())
      await advanceTimeToForNextBlock(periodEnd(missedPeriod))
      await mine()
      await proofs.markProofAsMissing(slotId, missedPeriod)
      await expect(
        proofs.markProofAsMissing(slotId, missedPeriod)
      ).to.be.revertedWith("Proofs_ProofAlreadyMarkedMissing")
    })

    it("requires no proofs when slot is finished", async function () {
      await waitUntilProofIsRequired(slotId)
      await proofs.setSlotState(slotId, SlotState.Finished)
      expect(await proofs.isProofRequired(slotId)).to.be.false
    })
  })
})
