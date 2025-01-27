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
  await ethers.provider.send("evm_setNextBlockTimestamp", [time + 1])
  await ethers.provider.send("evm_setAutomine", [automine])
}

async function setAutomine(enabled) {
  await ethers.provider.send("evm_setAutomine", [enabled])
}

/**
 * Mines new block.
 *
 * This call increases the block's timestamp by 1!
 *
 * @returns {Promise<void>}
 */
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

/**
 * Function that advances time by adding seconds to current timestamp for **next block**.
 *
 * If you need the timestamp to be already applied for current block then mine a new block with `mine()` after this call.
 * This is mainly needed when doing assertions on top of view calls that does not create transactions and mine new block.
 *
 * @param timestamp
 * @returns {Promise<void>}
 */
async function advanceTimeForNextBlock(seconds) {
  await ethers.provider.send("evm_increaseTime", [seconds])
}

/**
 * Function that sets specific timestamp for **next block**.
 *
 * If you need the timestamp to be already applied for current block then mine a new block with `mine()` after this call.
 * This is mainly needed when doing assertions on top of view calls that does not create transactions and mine new block.
 *
 * @param timestamp
 * @returns {Promise<void>}
 */
async function advanceTimeToForNextBlock(timestamp) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp])
}

module.exports = {
  snapshot,
  revert,
  setAutomine,
  mine,
  ensureMinimumBlockHeight,
  currentTime,
  advanceTimeForNextBlock,
  advanceTimeToForNextBlock,
}
