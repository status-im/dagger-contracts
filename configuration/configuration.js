const fs = require("fs")

const BASE_PATH = __dirname + "/networks"

const DEFAULT_CONFIGURATION = {
  collateral: {
    repairRewardPercentage: 10,
    maxNumberOfSlashes: 2,
    slashCriterion: 2,
    slashPercentage: 20,
  },
  proofs: {
    // period has to be less than downtime * blocktime
    period: 120, // seconds
    timeout: 30, // seconds
    downtime: 64, // number of blocks
    downtimeProduct: 67 // number of blocks
  },
  reservations: {
    maxReservations: 3
  },
  requestDurationLimit: 60*60*24*30 // 30 days
}

function loadConfiguration(name) {
  const path = `${BASE_PATH}/${name}/configuration.js`
  if(fs.existsSync(path)) {
    return require(path)
  } else {
    return DEFAULT_CONFIGURATION
  }
}

module.exports = { loadConfiguration }
