const { ethers } = require("hardhat")
const { keccak256, defaultAbiCoder } = ethers

function requestId(request) {
  const Ask = "tuple(int64, uint256, uint256, uint256, uint256, uint256, int64)"
  const Erasure = "tuple(uint64)"
  const PoR = "tuple(bytes, bytes, bytes)"
  const Content = "tuple(string, " + Erasure + ", " + PoR + ")"
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
    ask.reward,
    ask.collateral,
    ask.maxSlotLoss,
  ]
}

function erasureToArray(erasure) {
  return [erasure.totalChunks]
}

function porToArray(por) {
  return [por.u, por.publicKey, por.name]
}

function contentToArray(content) {
  return [content.cid, erasureToArray(content.erasure), porToArray(content.por)]
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
