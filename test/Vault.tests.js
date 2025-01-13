const { expect } = require("chai")
const { ethers } = require("hardhat")
const { randomBytes } = ethers.utils

describe("Vault", function () {
  let token
  let vault
  let payer
  let recipient

  beforeEach(async function () {
    const TestToken = await ethers.getContractFactory("TestToken")
    token = await TestToken.deploy()
    const Vault = await ethers.getContractFactory("Vault")
    vault = await Vault.deploy(token.address)
    ;[_, payer, recipient] = await ethers.getSigners()
    await token.mint(payer.address, 1_000_000)
  })

  describe("depositing", function () {
    const id = randomBytes(32)
    const amount = 42

    it("accepts deposits of tokens", async function () {
      await token.connect(payer).approve(vault.address, amount)
      await vault.deposit(id, payer.address, amount)
      expect(await vault.amount(id)).to.equal(amount)
    })

    it("keeps custody of tokens that are deposited", async function () {
      await token.connect(payer).approve(vault.address, amount)
      await vault.deposit(id, payer.address, amount)
      expect(await token.balanceOf(vault.address)).to.equal(amount)
    })

    it("deposit fails when tokens cannot be transferred", async function () {
      await token.connect(payer).approve(vault.address, amount - 1)
      const depositing = vault.deposit(id, payer.address, amount)
      await expect(depositing).to.be.revertedWith("insufficient allowance")
    })

    it("requires deposit ids to be unique", async function () {
      await token.connect(payer).approve(vault.address, 2 * amount)
      await vault.deposit(id, payer.address, amount)
      const depositing = vault.deposit(id, payer.address, amount)
      await expect(depositing).to.be.revertedWith("DepositAlreadyExists")
    })

    it("separates deposits from different owners", async function () {
      let [owner1, owner2] = await ethers.getSigners()
      await token.connect(payer).approve(vault.address, 3)
      await vault.connect(owner1).deposit(id, payer.address, 1)
      await vault.connect(owner2).deposit(id, payer.address, 2)
      expect(await vault.connect(owner1).amount(id)).to.equal(1)
      expect(await vault.connect(owner2).amount(id)).to.equal(2)
    })
  })

  describe("withdrawing", function () {
    const id = randomBytes(32)

    it("can withdraw a deposit", async function () {
      const amount = 42
      await token.connect(payer).approve(vault.address, amount)
      await vault.deposit(id, payer.address, amount)
      await vault.withdraw(id, recipient.address)
      expect(await vault.amount(id)).to.equal(0)
      expect(await token.balanceOf(recipient.address)).to.equal(amount)
    })

    it("ignores withdrawal of an empty deposit", async function () {
      await vault.withdraw(id, recipient.address)
      expect(await token.balanceOf(recipient.address)).to.equal(0)
    })
  })
})
