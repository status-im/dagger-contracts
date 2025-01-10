const { ethers } = require("hardhat")
const { keccak256, defaultAbiCoder } = ethers.utils

function requestId(request) {
  const Ask = "tuple(int64, uint256, uint256, uint256, uint256, uint256, int64)"
  const Content = "tuple(string, bytes32)"
  const Request =
    "tuple(address, " + Ask + ", " + Content + ", uint256, bytes32)"
  return keccak256(defaultAbiCoder.encode([Request], requestToArray(request)))
}

function askToArray(ask) {
  return [
    ask.slots,
    ask.slotSize,
    ask.duration,
    ask.proofProbability,
    ask.pricePerByte,
    ask.collateralPerByte,
    ask.maxSlotLoss,
  ]
}

function contentToArray(content) {
  return [content.cid, content.merkleRoot]
}

function requestToArray(request) {
  return [
    [
      request.client,
      askToArray(request.ask),
      contentToArray(request.content),
      request.expiry,
      request.nonce,
    ],
  ]
}

function slotId(slot) {
  const types = "tuple(bytes32, uint256)"
  const values = [slot.request, slot.index]
  const encoding = defaultAbiCoder.encode([types], [values])
  return keccak256(encoding)
}

module.exports = {
  requestId,
  slotId,
  requestToArray,
  askToArray,
}
