const { expect } = require("chai")
const { ethers } = require("hardhat")
const { randomBytes } = ethers.utils
const { currentTime, advanceTimeToForNextBlock } = require("./evm")

describe("Vault", function () {
  let token
  let vault
  let account, account2, account3

  beforeEach(async function () {
    const TestToken = await ethers.getContractFactory("TestToken")
    token = await TestToken.deploy()
    const Vault = await ethers.getContractFactory("Vault")
    vault = await Vault.deploy(token.address)
    ;[, account, account2, account3] = await ethers.getSigners()
    await token.mint(account.address, 1_000_000)
    await token.mint(account2.address, 1_000_000)
    await token.mint(account3.address, 1_000_000)
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

    it("adds multiple deposits to the balance", async function () {
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

  describe("transfering", function () {
    const context = randomBytes(32)
    const amount = 42

    beforeEach(async function () {
      await token.connect(account).approve(vault.address, amount)
      await vault.deposit(context, account.address, amount)
    })

    it("can transfer tokens from one recipient to the other", async function () {
      await vault.transfer(context, account.address, account2.address, amount)
      expect(await vault.balance(context, account.address)).to.equal(0)
      expect(await vault.balance(context, account2.address)).to.equal(amount)
    })

    it("can transfer part of a balance", async function () {
      await vault.transfer(context, account.address, account2.address, 10)
      expect(await vault.balance(context, account.address)).to.equal(
        amount - 10
      )
      expect(await vault.balance(context, account2.address)).to.equal(10)
    })

    it("does not transfer more than the balance", async function () {
      await expect(
        vault.transfer(context, account.address, account2.address, amount + 1)
      ).to.be.revertedWith("InsufficientBalance")
    })

    it("can withdraw funds that were transfered in", async function () {
      await vault.transfer(context, account.address, account2.address, amount)
      const before = await token.balanceOf(account2.address)
      await vault.withdraw(context, account2.address)
      const after = await token.balanceOf(account2.address)
      expect(after - before).to.equal(amount)
    })

    it("cannot withdraw funds that were transfered out", async function () {
      await vault.transfer(context, account.address, account2.address, amount)
      const before = await token.balanceOf(account.address)
      await vault.withdraw(context, account.address)
      const after = await token.balanceOf(account.address)
      expect(after).to.equal(before)
    })

    it("can transfer out funds that were transfered in", async function () {
      await vault.transfer(context, account.address, account2.address, amount)
      await vault.transfer(context, account2.address, account3.address, amount)
      expect(await vault.balance(context, account2.address)).to.equal(0)
      expect(await vault.balance(context, account3.address)).to.equal(amount)
    })
  })

  describe("designating", async function () {
    const context = randomBytes(32)
    const amount = 42

    beforeEach(async function () {
      ;[, , account2] = await ethers.getSigners()
      await token.connect(account).approve(vault.address, amount)
      await vault.deposit(context, account.address, amount)
    })

    it("can designate tokens for a single recipient", async function () {
      await vault.designate(context, account.address, amount)
      expect(await vault.designated(context, account.address)).to.equal(amount)
    })

    it("can designate part of the balance", async function () {
      await vault.designate(context, account.address, 10)
      expect(await vault.designated(context, account.address)).to.equal(10)
    })

    it("adds up designated tokens", async function () {
      await vault.designate(context, account.address, 10)
      await vault.designate(context, account.address, 10)
      expect(await vault.designated(context, account.address)).to.equal(20)
    })

    it("cannot designate more than the undesignated balance", async function () {
      await vault.designate(context, account.address, amount)
      await expect(
        vault.designate(context, account.address, 1)
      ).to.be.revertedWith("InsufficientBalance")
    })

    it("does not change the balance", async function () {
      await vault.designate(context, account.address, 10)
      expect(await vault.balance(context, account.address)).to.equal(amount)
    })

    it("does not allow designated tokens to be transfered", async function () {
      await vault.designate(context, account.address, 1)
      await expect(
        vault.transfer(context, account.address, account2.address, amount)
      ).to.be.revertedWith("InsufficientBalance")
    })

    it("allows designated tokens to be withdrawn", async function () {
      await vault.designate(context, account.address, 10)
      const before = await token.balanceOf(account.address)
      await vault.withdraw(context, account.address)
      const after = await token.balanceOf(account.address)
      expect(after - before).to.equal(amount)
    })

    it("does not withdraw designated tokens more than once", async function () {
      await vault.designate(context, account.address, 10)
      await vault.withdraw(context, account.address)
      const before = await token.balanceOf(account.address)
      await vault.withdraw(context, account.address)
      const after = await token.balanceOf(account.address)
      expect(after).to.equal(before)
    })

    it("allows designated tokens to be burned", async function () {
      await vault.designate(context, account.address, 10)
      await vault.burn(context, account.address)
      expect(await vault.balance(context, account.address)).to.equal(0)
    })

    it("moves burned designated tokens to address 0xdead", async function () {
      const dead = "0x000000000000000000000000000000000000dead"
      await vault.designate(context, account.address, 10)
      const before = await token.balanceOf(dead)
      await vault.burn(context, account.address)
      const after = await token.balanceOf(dead)
      expect(after - before).to.equal(amount)
    })
  })

  describe("locking", async function () {
    const context = randomBytes(32)
    const amount = 42

    let expiry
    let maximum

    beforeEach(async function () {
      await token.connect(account).approve(vault.address, amount)
      await vault.deposit(context, account.address, amount)
      let start = await currentTime()
      expiry = start + 10
      maximum = start + 20
    })

    it("can lock up all tokens in a context", async function () {
      await vault.lockup(context, expiry, maximum)
      expect((await vault.lock(context))[0]).to.equal(expiry)
      expect((await vault.lock(context))[1]).to.equal(maximum)
    })

    it("cannot lock up when already locked", async function () {
      await vault.lockup(context, expiry, maximum)
      const locking = vault.lockup(context, expiry, maximum)
      await expect(locking).to.be.revertedWith("AlreadyLocked")
    })

    it("cannot lock when expiry is past maximum", async function () {
      const locking = vault.lockup(context, maximum + 1, maximum)
      await expect(locking).to.be.revertedWith("ExpiryPastMaximum")
    })

    it("does not allow withdrawal before lock expires", async function () {
      await vault.lockup(context, expiry, expiry)
      await advanceTimeToForNextBlock(expiry - 1)
      const withdrawing = vault.withdraw(context, account.address)
      await expect(withdrawing).to.be.revertedWith("Locked")
    })

    it("allows withdrawal after lock expires", async function () {
      await vault.lockup(context, expiry, expiry)
      await advanceTimeToForNextBlock(expiry)
      const before = await token.balanceOf(account.address)
      await vault.withdraw(context, account.address)
      const after = await token.balanceOf(account.address)
      expect(after - before).to.equal(amount)
    })

    it("can extend a lock expiry up to its maximum", async function () {
      await vault.lockup(context, expiry, maximum)
      await vault.extend(context, expiry + 1)
      expect((await vault.lock(context))[0]).to.equal(expiry + 1)
      await vault.extend(context, maximum)
      expect((await vault.lock(context))[0]).to.equal(maximum)
    })

    it("cannot extend a lock past its maximum", async function () {
      await vault.lockup(context, expiry, maximum)
      const extending = vault.extend(context, maximum + 1)
      await expect(extending).to.be.revertedWith("ExpiryPastMaximum")
    })

    it("cannot move expiry forward", async function () {
      await vault.lockup(context, expiry, maximum)
      const extending = vault.extend(context, expiry - 1)
      await expect(extending).to.be.revertedWith("InvalidExpiry")
    })

    it("cannot extend an expired lock", async function () {
      await vault.lockup(context, expiry, maximum)
      await advanceTimeToForNextBlock(expiry)
      const extending = vault.extend(context, maximum)
      await expect(extending).to.be.revertedWith("LockExpired")
    })

    it("deletes lock when funds are withdrawn", async function () {
      await vault.lockup(context, expiry, expiry)
      await advanceTimeToForNextBlock(expiry)
      await vault.withdraw(context, account.address)
      expect((await vault.lock(context))[0]).to.equal(0)
      expect((await vault.lock(context))[1]).to.equal(0)
    })
  })
})
