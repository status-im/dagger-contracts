const { expect } = require("chai")
const { ethers } = require("hardhat")
const { exampleRequest, exampleConfiguration } = require("./examples")
const { requestId, slotId } = require("./ids")
const { SlotState } = require("./requests")

describe("SlotReservations", function () {
  let reservations
  let provider, address1, address2, address3
  let request
  let reqId
  let slot
  let slotIndex
  let id // can't use slotId because it'll shadow the function slotId
  const config = exampleConfiguration()

  beforeEach(async function () {
    let SlotReservations = await ethers.getContractFactory(
      "TestSlotReservations"
    )
    reservations = await SlotReservations.deploy(config.reservations)
    ;[provider, address1, address2, address3] = await ethers.getSigners()

    request = await exampleRequest()
    reqId = requestId(request)
    slotIndex = request.ask.slots / 2
    slot = {
      request: reqId,
      index: slotIndex,
    }
    id = slotId(slot)

    await reservations.setSlotState(id, SlotState.Free)
  })

  function switchAccount(account) {
    reservations = reservations.connect(account)
  }

  it("allows a slot to be reserved", async function () {
    expect(reservations.reserveSlot(reqId, slotIndex)).to.not.be.reverted
  })

  it("contains the correct addresses after reservation", async function () {
    await reservations.reserveSlot(reqId, slotIndex)
    expect(await reservations.contains(id, provider.address)).to.be.true

    switchAccount(address1)
    await reservations.reserveSlot(reqId, slotIndex)
    expect(await reservations.contains(id, address1.address)).to.be.true
  })

  it("has the correct number of addresses after reservation", async function () {
    await reservations.reserveSlot(reqId, slotIndex)
    expect(await reservations.length(id)).to.equal(1)

    switchAccount(address1)
    await reservations.reserveSlot(reqId, slotIndex)
    expect(await reservations.length(id)).to.equal(2)
  })

  it("reports a slot can be reserved", async function () {
    expect(await reservations.canReserveSlot(reqId, slotIndex)).to.be.true
  })

  it("cannot reserve a slot more than once", async function () {
    await reservations.reserveSlot(reqId, slotIndex)
    await expect(reservations.reserveSlot(reqId, slotIndex)).to.be.revertedWith(
      "SlotReservations_ReservationNotAllowed"
    )
    expect(await reservations.length(id)).to.equal(1)
  })

  it("reports a slot cannot be reserved if already reserved", async function () {
    await reservations.reserveSlot(reqId, slotIndex)
    expect(await reservations.canReserveSlot(reqId, slotIndex)).to.be.false
  })

  it("cannot reserve a slot if reservations are at capacity", async function () {
    switchAccount(address1)
    await reservations.reserveSlot(reqId, slotIndex)
    switchAccount(address2)
    await reservations.reserveSlot(reqId, slotIndex)
    switchAccount(address3)
    await reservations.reserveSlot(reqId, slotIndex)
    switchAccount(provider)
    await expect(reservations.reserveSlot(reqId, slotIndex)).to.be.revertedWith(
      "Reservation not allowed"
    )
    expect(await reservations.length(id)).to.equal(3)
    expect(await reservations.contains(id, provider.address)).to.be.false
  })

  it("reports a slot cannot be reserved if reservations are at capacity", async function () {
    switchAccount(address1)
    await reservations.reserveSlot(reqId, slotIndex)
    switchAccount(address2)
    await reservations.reserveSlot(reqId, slotIndex)
    switchAccount(address3)
    await reservations.reserveSlot(reqId, slotIndex)
    switchAccount(provider)
    expect(await reservations.canReserveSlot(reqId, slotIndex)).to.be.false
  })

  it("cannot reserve a slot if not free", async function () {
    await reservations.setSlotState(id, SlotState.Filled)
    await expect(reservations.reserveSlot(reqId, slotIndex)).to.be.revertedWith(
      "Reservation not allowed"
    )
    expect(await reservations.length(id)).to.equal(0)
  })

  it("reports a slot cannot be reserved if not free", async function () {
    await reservations.setSlotState(id, SlotState.Filled)
    expect(await reservations.canReserveSlot(reqId, slotIndex)).to.be.false
  })

  it("should emit an event when slot reservations are full", async function () {
    await reservations.reserveSlot(reqId, slotIndex)
    switchAccount(address1)
    await reservations.reserveSlot(reqId, slotIndex)
    switchAccount(address2)
    await expect(reservations.reserveSlot(reqId, slotIndex))
      .to.emit(reservations, "SlotReservationsFull")
      .withArgs(reqId, slotIndex)
  })

  it("should not emit an event when reservations are not full", async function () {
    await expect(reservations.reserveSlot(reqId, slotIndex)).to.not.emit(
      reservations,
      "SlotReservationsFull"
    )
  })
})
