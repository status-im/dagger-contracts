const { expect } = require("chai")
const { ethers } = require("hardhat")
const { randomBytes } = ethers.utils

describe("Vault", function () {
  let token
  let vault
  let account

  beforeEach(async function () {
    const TestToken = await ethers.getContractFactory("TestToken")
    token = await TestToken.deploy()
    const Vault = await ethers.getContractFactory("Vault")
    vault = await Vault.deploy(token.address)
    ;[, account] = await ethers.getSigners()
    await token.mint(account.address, 1_000_000)
  })

  describe("depositing", function () {
    const context = randomBytes(32)
    const amount = 42

    it("accepts deposits of tokens", async function () {
      await token.connect(account).approve(vault.address, amount)
      await vault.deposit(context, account.address, amount)
      expect(await vault.balance(context, account.address)).to.equal(amount)
    })

    it("keeps custody of tokens that are deposited", async function () {
      await token.connect(account).approve(vault.address, amount)
      await vault.deposit(context, account.address, amount)
      expect(await token.balanceOf(vault.address)).to.equal(amount)
    })

    it("deposit fails when tokens cannot be transferred", async function () {
      await token.connect(account).approve(vault.address, amount - 1)
      const depositing = vault.deposit(context, account.address, amount)
      await expect(depositing).to.be.revertedWith("insufficient allowance")
    })

    it("multiple deposits add to the balance", async function () {
      await token.connect(account).approve(vault.address, amount)
      await vault.deposit(context, account.address, amount / 2)
      await vault.deposit(context, account.address, amount / 2)
      expect(await vault.balance(context, account.address)).to.equal(amount)
    })

    it("separates deposits from different contexts", async function () {
      const context1 = randomBytes(32)
      const context2 = randomBytes(32)
      await token.connect(account).approve(vault.address, 3)
      await vault.deposit(context1, account.address, 1)
      await vault.deposit(context2, account.address, 2)
      expect(await vault.balance(context1, account.address)).to.equal(1)
      expect(await vault.balance(context2, account.address)).to.equal(2)
    })

    it("separates deposits from different controllers", async function () {
      const [, , controller1, controller2] = await ethers.getSigners()
      const vault1 = vault.connect(controller1)
      const vault2 = vault.connect(controller2)
      await token.connect(account).approve(vault.address, 3)
      await vault1.deposit(context, account.address, 1)
      await vault2.deposit(context, account.address, 2)
      expect(await vault1.balance(context, account.address)).to.equal(1)
      expect(await vault2.balance(context, account.address)).to.equal(2)
    })
  })

  describe("withdrawing", function () {
    const context = randomBytes(32)
    const amount = 42

    beforeEach(async function () {
      await token.connect(account).approve(vault.address, amount)
      await vault.deposit(context, account.address, amount)
    })

    it("can withdraw a deposit", async function () {
      const before = await token.balanceOf(account.address)
      await vault.withdraw(context, account.address)
      const after = await token.balanceOf(account.address)
      expect(after - before).to.equal(amount)
    })

    it("empties the balance when withdrawing", async function () {
      await vault.withdraw(context, account.address)
      expect(await vault.balance(context, account.address)).to.equal(0)
    })

    it("does not withdraw more than once", async function () {
      await vault.withdraw(context, account.address)
      const before = await token.balanceOf(account.address)
      await vault.withdraw(context, account.address)
      const after = await token.balanceOf(account.address)
      expect(after).to.equal(before)
    })
  })

  describe("burning", function () {
    const context = randomBytes(32)
    const amount = 42

    beforeEach(async function () {
      await token.connect(account).approve(vault.address, amount)
      await vault.deposit(context, account.address, amount)
    })

    it("can burn a deposit", async function () {
      await vault.burn(context, account.address)
      expect(await vault.balance(context, account.address)).to.equal(0)
    })

    it("no longer allows withdrawal", async function () {
      await vault.burn(context, account.address)
      const before = await token.balanceOf(account.address)
      await vault.withdraw(context, account.address)
      const after = await token.balanceOf(account.address)
      expect(after).to.equal(before)
    })

    it("moves the tokens to address 0xdead", async function () {
      const dead = "0x000000000000000000000000000000000000dead"
      const before = await token.balanceOf(dead)
      await vault.burn(context, account.address)
      const after = await token.balanceOf(dead)
      expect(after - before).to.equal(amount)
    })
  })
})
