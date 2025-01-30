require("@nomiclabs/hardhat-waffle")
require("hardhat-deploy")
require("hardhat-deploy-ethers")

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "paris",
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },
  mocha: {
    bail: true,
    slow: 200,
    timeout: 30 * 1000,
  },
  namedAccounts: {
    deployer: { default: 0 },
  },
  networks: {
    hardhat: {
      tags: ["local"],
      allowBlocksWithSameTimestamp: true
    },
    codexdisttestnetwork: {
      url: `${process.env.DISTTEST_NETWORK_URL}`,
    },
    codex_devnet: {
      url: `${process.env.CODEX_DEVNET_URL}`,
    },
    codex_testnet: {
      url: `${process.env.CODEX_TESTNET_URL}`,
    },
    taiko_test: {
      url: "https://rpc.test.taiko.xyz",
      accounts: [
        // "<YOUR_SEPOLIA_TEST_WALLET_PRIVATE_KEY_HERE>"
      ],
    },
  },
}
