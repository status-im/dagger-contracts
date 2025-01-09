const { advanceTimeToForNextBlock, currentTime } = require("./evm")
const { slotId, requestId } = require("./ids")
const { maxPrice, payoutForDuration } = require("./price")

/**
 * @dev This will not advance the time right on the "expiry threshold" but will most probably "overshoot it"
 *      because "currentTime" most probably is not the time at which the request is created, but it is used
 *      in the next timestamp calculation with `now + expiry`.
 * @param request
 * @returns {Promise<void>}
 */
async function waitUntilCancelled(request) {
  // We do +1, because the expiry check in contract is done as `>` and not `>=`.
  await advanceTimeToForNextBlock((await currentTime()) + request.expiry + 1)
}

async function waitUntilSlotsFilled(contract, request, proof, token, slots) {
  let collateral = request.ask.collateralPerByte * request.ask.slotSize
  await token.approve(contract.address, collateral * slots.length)

  let requestEnd = (await contract.requestEnd(requestId(request))).toNumber()
  const payouts = []
  for (let slotIndex of slots) {
    await contract.reserveSlot(requestId(request), slotIndex)
    await contract.fillSlot(requestId(request), slotIndex, proof)

    payouts[slotIndex] = payoutForDuration(
      request,
      await currentTime(),
      requestEnd
    )
  }

  return payouts
}

async function waitUntilStarted(contract, request, proof, token) {
  return waitUntilSlotsFilled(
    contract,
    request,
    proof,
    token,
    Array.from({ length: request.ask.slots }, (_, i) => i)
  )
}

async function waitUntilFinished(contract, requestId) {
  const end = (await contract.requestEnd(requestId)).toNumber()
  // We do +1, because the end check in contract is done as `>` and not `>=`.
  await advanceTimeToForNextBlock(end + 1)
}

async function waitUntilFailed(contract, request) {
  slot = { request: requestId(request), slot: 0 }
  for (let i = 0; i <= request.ask.maxSlotLoss; i++) {
    slot.index = i
    let id = slotId(slot)
    await contract.forciblyFreeSlot(id)
  }
}

async function waitUntilSlotFailed(contract, request, slot) {
  let index = 0
  let freed = 0
  while (freed <= request.ask.maxSlotLoss) {
    if (index !== slot.index) {
      await contract.forciblyFreeSlot(slotId({ ...slot, index }))
      freed++
    }
    index++
  }
}

function patchOverloads(contract) {
  contract.freeSlot = async (slotId, rewardRecipient, collateralRecipient) => {
    const logicalXor = (a, b) => (a || b) && !(a && b)
    if (logicalXor(rewardRecipient, collateralRecipient)) {
      // XOR, if exactly one is truthy
      throw new Error(
        "Invalid freeSlot overload, you must specify both `rewardRecipient` and `collateralRecipient` or neither."
      )
    }

    if (!rewardRecipient && !collateralRecipient) {
      // calls `freeSlot` overload without `rewardRecipient` and `collateralRecipient`
      const fn = contract["freeSlot(bytes32)"]
      return await fn(slotId)
    }

    const fn = contract["freeSlot(bytes32,address,address)"]
    return await fn(slotId, rewardRecipient, collateralRecipient)
  }
  contract.withdrawFunds = async (requestId, withdrawRecipient) => {
    if (!withdrawRecipient) {
      // calls `withdrawFunds` overload without `withdrawRecipient`
      const fn = contract["withdrawFunds(bytes32)"]
      return await fn(requestId)
    }
    const fn = contract["withdrawFunds(bytes32,address)"]
    return await fn(requestId, withdrawRecipient)
  }
}

module.exports = {
  waitUntilCancelled,
  waitUntilStarted,
  waitUntilSlotsFilled,
  waitUntilFinished,
  waitUntilFailed,
  waitUntilSlotFailed,
  patchOverloads,
}
