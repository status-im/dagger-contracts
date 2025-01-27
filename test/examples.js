const { ethers } = require("hardhat")
const { hours } = require("./time")
const { hexlify, randomBytes } = ethers.utils

const exampleConfiguration = () => ({
  collateral: {
    repairRewardPercentage: 10,
    maxNumberOfSlashes: 5,
    slashPercentage: 10,
    validatorRewardPercentage: 20,
  },
  proofs: {
    period: 10,
    timeout: 5,
    downtime: 64,
    zkeyHash: "",
    downtimeProduct: 67,
  },
  reservations: {
    maxReservations: 3,
  },
})

const exampleRequest = async () => {
  return {
    client: hexlify(randomBytes(20)),
    ask: {
      slots: 4,
      slotSize: 1 * 1024 * 1024 * 1024, // 1 Gigabyte
      duration: hours(10),
      proofProbability: 4, // require a proof roughly once every 4 periods
      pricePerBytePerSecond: 1,
      maxSlotLoss: 2,
      collateralPerByte: 1,
    },
    content: {
      cid: Buffer.from("zb2rhheVmk3bLks5MgzTqyznLu1zqGH5jrfTA1eAZXrjx7Vob"),
      merkleRoot: Array.from(randomBytes(32)),
    },
    expiry: hours(1),
    nonce: hexlify(randomBytes(32)),
  }
}

const exampleProof = () => ({
  a: { x: 1, y: 2 },
  b: { x: [3, 4], y: [5, 6] },
  c: { x: 7, y: 8 },
})

const invalidProof = () => ({
  a: { x: 0, y: 0 },
  b: { x: [0, 0], y: [0, 0] },
  c: { x: 0, y: 0 },
})

module.exports = {
  exampleConfiguration,
  exampleRequest,
  exampleProof,
  invalidProof,
}
