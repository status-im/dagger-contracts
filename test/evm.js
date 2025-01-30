const { ethers } = require("hardhat")

let snapshots = []

async function snapshot() {
  const id = await ethers.provider.send("evm_snapshot")
  const time = await currentTime()
  const automine = await ethers.provider.send("hardhat_getAutomine")
  snapshots.push({ id, time, automine })
}

async function revert() {
  const { id, time, automine } = snapshots.pop()
  await ethers.provider.send("evm_revert", [id])
  await ethers.provider.send("evm_setNextBlockTimestamp", [time])
  await ethers.provider.send("evm_setAutomine", [automine])
}

async function setAutomine(enabled) {
  await ethers.provider.send("evm_setAutomine", [enabled])
}

async function mine() {
  await ethers.provider.send("evm_mine")
}

async function ensureMinimumBlockHeight(height) {
  while ((await ethers.provider.getBlockNumber()) < height) {
    await mine()
  }
}

async function currentTime() {
  let block = await ethers.provider.getBlock("latest")
  return block.timestamp
}

async function advanceTime(seconds) {
  await ethers.provider.send("evm_increaseTime", [seconds])
  await mine()
}

async function advanceTimeTo(timestamp) {
  await setNextBlockTimestamp(timestamp)
  await mine()
}

async function setNextBlockTimestamp(timestamp) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp])
}

module.exports = {
  snapshot,
  revert,
  setAutomine,
  mine,
  ensureMinimumBlockHeight,
  currentTime,
  advanceTime,
  advanceTimeTo,
  setNextBlockTimestamp,
}
