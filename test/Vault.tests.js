const { expect } = require("chai")
const { ethers } = require("hardhat")
const { randomBytes } = ethers.utils
const {
  currentTime,
  advanceTimeToForNextBlock,
  mine,
  setAutomine,
  snapshot,
  revert,
} = require("./evm")

describe("Vault", function () {
  let token
  let vault
  let controller
  let account, account2, account3

  beforeEach(async function () {
    await snapshot()
    const TestToken = await ethers.getContractFactory("TestToken")
    token = await TestToken.deploy()
    const Vault = await ethers.getContractFactory("Vault")
    vault = await Vault.deploy(token.address)
    ;[controller, account, account2, account3] = await ethers.getSigners()
    await token.mint(account.address, 1_000_000)
    await token.mint(account2.address, 1_000_000)
    await token.mint(account3.address, 1_000_000)
  })

  afterEach(async function () {
    await revert()
  })

  describe("depositing", function () {
    const context = randomBytes(32)
    const amount = 42

    it("accepts deposits of tokens", async function () {
      await token.connect(account).approve(vault.address, amount)
      await vault.deposit(context, account.address, amount)
      expect(await vault.getBalance(context, account.address)).to.equal(amount)
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
      expect(await vault.getBalance(context, account.address)).to.equal(amount)
    })

    it("separates deposits from different contexts", async function () {
      const context1 = randomBytes(32)
      const context2 = randomBytes(32)
      await token.connect(account).approve(vault.address, 3)
      await vault.deposit(context1, account.address, 1)
      await vault.deposit(context2, account.address, 2)
      expect(await vault.getBalance(context1, account.address)).to.equal(1)
      expect(await vault.getBalance(context2, account.address)).to.equal(2)
    })

    it("separates deposits from different controllers", async function () {
      const [, , controller1, controller2] = await ethers.getSigners()
      const vault1 = vault.connect(controller1)
      const vault2 = vault.connect(controller2)
      await token.connect(account).approve(vault.address, 3)
      await vault1.deposit(context, account.address, 1)
      await vault2.deposit(context, account.address, 2)
      expect(await vault1.getBalance(context, account.address)).to.equal(1)
      expect(await vault2.getBalance(context, account.address)).to.equal(2)
    })
  })

  describe("withdrawing", function () {
    const context = randomBytes(32)
    const amount = 42

    beforeEach(async function () {
      await token.connect(account).approve(vault.address, amount)
      await vault.deposit(context, account.address, amount)
    })

    it("allows controller to withdraw for a recipient", async function () {
      const before = await token.balanceOf(account.address)
      await vault.withdraw(context, account.address)
      const after = await token.balanceOf(account.address)
      expect(after - before).to.equal(amount)
    })

    it("allows recipient to withdraw for itself", async function () {
      const before = await token.balanceOf(account.address)
      await vault
        .connect(account)
        .withdrawByRecipient(controller.address, context)
      const after = await token.balanceOf(account.address)
      expect(after - before).to.equal(amount)
    })

    it("empties the balance when withdrawing", async function () {
      await vault.withdraw(context, account.address)
      expect(await vault.getBalance(context, account.address)).to.equal(0)
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
      expect(await vault.getBalance(context, account.address)).to.equal(0)
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
      expect(await vault.getBalance(context, account.address)).to.equal(0)
      expect(await vault.getBalance(context, account2.address)).to.equal(amount)
    })

    it("can transfer part of a balance", async function () {
      await vault.transfer(context, account.address, account2.address, 10)
      expect(await vault.getBalance(context, account.address)).to.equal(
        amount - 10
      )
      expect(await vault.getBalance(context, account2.address)).to.equal(10)
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
      expect(await vault.getBalance(context, account2.address)).to.equal(0)
      expect(await vault.getBalance(context, account3.address)).to.equal(amount)
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
      expect(
        await vault.getDesignatedBalance(context, account.address)
      ).to.equal(amount)
    })

    it("can designate part of the balance", async function () {
      await vault.designate(context, account.address, 10)
      expect(
        await vault.getDesignatedBalance(context, account.address)
      ).to.equal(10)
    })

    it("adds up designated tokens", async function () {
      await vault.designate(context, account.address, 10)
      await vault.designate(context, account.address, 10)
      expect(
        await vault.getDesignatedBalance(context, account.address)
      ).to.equal(20)
    })

    it("cannot designate more than the undesignated balance", async function () {
      await vault.designate(context, account.address, amount)
      await expect(
        vault.designate(context, account.address, 1)
      ).to.be.revertedWith("InsufficientBalance")
    })

    it("does not change the balance", async function () {
      await vault.designate(context, account.address, 10)
      expect(await vault.getBalance(context, account.address)).to.equal(amount)
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
      expect(await vault.getBalance(context, account.address)).to.equal(0)
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
      await vault.lock(context, expiry, maximum)
      expect((await vault.getLock(context))[0]).to.equal(expiry)
      expect((await vault.getLock(context))[1]).to.equal(maximum)
    })

    it("cannot lock up when already locked", async function () {
      await vault.lock(context, expiry, maximum)
      const locking = vault.lock(context, expiry, maximum)
      await expect(locking).to.be.revertedWith("AlreadyLocked")
    })

    it("cannot lock when expiry is past maximum", async function () {
      const locking = vault.lock(context, maximum + 1, maximum)
      await expect(locking).to.be.revertedWith("ExpiryPastMaximum")
    })

    it("does not allow withdrawal before lock expires", async function () {
      await vault.lock(context, expiry, expiry)
      await advanceTimeToForNextBlock(expiry - 1)
      const withdrawing = vault.withdraw(context, account.address)
      await expect(withdrawing).to.be.revertedWith("Locked")
    })

    it("locks withdrawal for all recipients in a context", async function () {
      await vault.lock(context, expiry, expiry)
      const address1 = account.address
      const address2 = account2.address
      await vault.transfer(context, address1, address2, amount / 2)
      let withdrawing1 = vault.withdraw(context, address1)
      let withdrawing2 = vault.withdraw(context, address2)
      await expect(withdrawing1).to.be.revertedWith("Locked")
      await expect(withdrawing2).to.be.revertedWith("Locked")
    })

    it("locks withdrawal for newly deposited tokens", async function () {
      await vault.lock(context, expiry, expiry)
      await token.connect(account2).approve(vault.address, amount)
      await vault.deposit(context, account2.address, amount)
      const withdrawing = vault.withdraw(context, account2.address)
      await expect(withdrawing).to.be.revertedWith("Locked")
    })

    it("allows withdrawal after lock expires", async function () {
      await vault.lock(context, expiry, expiry)
      await advanceTimeToForNextBlock(expiry)
      const before = await token.balanceOf(account.address)
      await vault.withdraw(context, account.address)
      const after = await token.balanceOf(account.address)
      expect(after - before).to.equal(amount)
    })

    it("can extend a lock expiry up to its maximum", async function () {
      await vault.lock(context, expiry, maximum)
      await vault.extendLock(context, expiry + 1)
      expect((await vault.getLock(context))[0]).to.equal(expiry + 1)
      await vault.extendLock(context, maximum)
      expect((await vault.getLock(context))[0]).to.equal(maximum)
    })

    it("cannot extend a lock past its maximum", async function () {
      await vault.lock(context, expiry, maximum)
      const extending = vault.extendLock(context, maximum + 1)
      await expect(extending).to.be.revertedWith("ExpiryPastMaximum")
    })

    it("cannot move expiry forward", async function () {
      await vault.lock(context, expiry, maximum)
      const extending = vault.extendLock(context, expiry - 1)
      await expect(extending).to.be.revertedWith("InvalidExpiry")
    })

    it("cannot extend an expired lock", async function () {
      await vault.lock(context, expiry, maximum)
      await advanceTimeToForNextBlock(expiry)
      const extending = vault.extendLock(context, maximum)
      await expect(extending).to.be.revertedWith("LockRequired")
    })

    it("allows locked tokens to be burned", async function () {
      await vault.lock(context, expiry, expiry)
      await vault.burn(context, account.address)
      expect(await vault.getBalance(context, account.address)).to.equal(0)
    })

    it("deletes lock when funds are withdrawn", async function () {
      await vault.lock(context, expiry, expiry)
      await advanceTimeToForNextBlock(expiry)
      await vault.withdraw(context, account.address)
      expect((await vault.getLock(context))[0]).to.equal(0)
      expect((await vault.getLock(context))[1]).to.equal(0)
    })
  })

  describe("flow", function () {
    const context = randomBytes(32)
    const deposit = 1000

    let sender
    let receiver
    let receiver2

    beforeEach(async function () {
      await token.connect(account).approve(vault.address, deposit)
      await vault.deposit(context, account.address, deposit)
      sender = account.address
      receiver = account2.address
      receiver2 = account3.address
    })

    async function getBalance(recipient) {
      return await vault.getBalance(context, recipient)
    }

    async function advanceTimeTo(timestamp) {
      await advanceTimeToForNextBlock(timestamp)
      await mine()
    }

    it("requires that a lock is set", async function () {
      await expect(vault.flow(context, sender, receiver, 2)).to.be.revertedWith(
        "LockRequired"
      )
    })

    it("requires that the lock is not expired", async function () {
      let expiry = (await currentTime()) + 20
      await vault.lock(context, expiry, expiry)
      await advanceTimeTo(expiry)
      await expect(vault.flow(context, sender, receiver, 2)).to.be.revertedWith(
        "LockRequired"
      )
    })

    describe("when a lock is set", async function () {
      let expiry
      let maximum

      beforeEach(async function () {
        expiry = (await currentTime()) + 80
        maximum = expiry + 20
        await vault.lock(context, expiry, maximum)
      })

      it("moves tokens over time", async function () {
        await vault.flow(context, sender, receiver, 2)
        const start = await currentTime()
        await advanceTimeTo(start + 2)
        expect(await getBalance(sender)).to.equal(deposit - 4)
        expect(await getBalance(receiver)).to.equal(4)
        await advanceTimeTo(start + 4)
        expect(await getBalance(sender)).to.equal(deposit - 8)
        expect(await getBalance(receiver)).to.equal(8)
      })

      it("can move tokens to several different recipients", async function () {
        await setAutomine(false)
        await vault.flow(context, sender, receiver, 1)
        await vault.flow(context, sender, receiver2, 2)
        await mine()
        const start = await currentTime()
        await advanceTimeTo(start + 2)
        expect(await getBalance(sender)).to.equal(deposit - 6)
        expect(await getBalance(receiver)).to.equal(2)
        expect(await getBalance(receiver2)).to.equal(4)
        await advanceTimeTo(start + 4)
        expect(await getBalance(sender)).to.equal(deposit - 12)
        expect(await getBalance(receiver)).to.equal(4)
        expect(await getBalance(receiver2)).to.equal(8)
      })

      it("allows flows to be diverted to other recipient", async function () {
        await setAutomine(false)
        await vault.flow(context, sender, receiver, 3)
        await vault.flow(context, receiver, receiver2, 1)
        await mine()
        const start = await currentTime()
        await advanceTimeTo(start + 2)
        expect(await getBalance(sender)).to.equal(deposit - 6)
        expect(await getBalance(receiver)).to.equal(4)
        expect(await getBalance(receiver2)).to.equal(2)
        await advanceTimeTo(start + 4)
        expect(await getBalance(sender)).to.equal(deposit - 12)
        expect(await getBalance(receiver)).to.equal(8)
        expect(await getBalance(receiver2)).to.equal(4)
      })

      it("allows flow to be reversed back to the sender", async function () {
        await setAutomine(false)
        await vault.flow(context, sender, receiver, 3)
        await vault.flow(context, receiver, sender, 3)
        await mine()
        const start = await currentTime()
        await advanceTimeTo(start + 2)
        expect(await getBalance(sender)).to.equal(deposit)
        expect(await getBalance(receiver)).to.equal(0)
        await advanceTimeTo(start + 4)
        expect(await getBalance(sender)).to.equal(deposit)
        expect(await getBalance(receiver)).to.equal(0)
      })

      it("can change flows over time", async function () {
        await setAutomine(false)
        await vault.flow(context, sender, receiver, 1)
        await vault.flow(context, sender, receiver2, 2)
        await mine()
        const start = await currentTime()
        advanceTimeToForNextBlock(start + 4)
        await vault.flow(context, receiver2, receiver, 1)
        await mine()
        expect(await getBalance(sender)).to.equal(deposit - 12)
        expect(await getBalance(receiver)).to.equal(4)
        expect(await getBalance(receiver2)).to.equal(8)
        await advanceTimeTo(start + 8)
        expect(await getBalance(sender)).to.equal(deposit - 24)
        expect(await getBalance(receiver)).to.equal(12)
        expect(await getBalance(receiver2)).to.equal(12)
        await advanceTimeTo(start + 12)
        expect(await getBalance(sender)).to.equal(deposit - 36)
        expect(await getBalance(receiver)).to.equal(20)
        expect(await getBalance(receiver2)).to.equal(16)
      })

      it("designates tokens that flow for the recipient", async function () {
        await vault.flow(context, sender, receiver, 3)
        const start = await currentTime()
        await advanceTimeTo(start + 7)
        expect(await vault.getDesignatedBalance(context, receiver)).to.equal(21)
      })

      it("stops flowing when lock expires", async function () {
        await vault.flow(context, sender, receiver, 2)
        const start = await currentTime()
        await advanceTimeTo(expiry)
        const total = (expiry - start) * 2
        expect(await getBalance(sender)).to.equal(deposit - total)
        expect(await getBalance(receiver)).to.equal(total)
        await advanceTimeTo(expiry + 10)
        expect(await getBalance(sender)).to.equal(deposit - total)
        expect(await getBalance(receiver)).to.equal(total)
      })

      it("flows longer when lock is extended", async function () {
        await vault.flow(context, sender, receiver, 2)
        const start = await currentTime()
        await vault.extendLock(context, maximum)
        await advanceTimeTo(maximum)
        const total = (maximum - start) * 2
        expect(await getBalance(sender)).to.equal(deposit - total)
        expect(await getBalance(receiver)).to.equal(total)
        await advanceTimeTo(maximum + 10)
        expect(await getBalance(sender)).to.equal(deposit - total)
        expect(await getBalance(receiver)).to.equal(total)
      })

      it("rejects negative flows", async function () {
        await expect(
          vault.flow(context, sender, receiver, -1)
        ).to.be.revertedWith("NegativeFlow")
      })

      it("rejects flow when insufficient available tokens", async function () {
        await expect(
          vault.flow(context, sender, receiver, 11)
        ).to.be.revertedWith("InsufficientBalance")
      })

      it("rejects total flows exceeding available tokens", async function () {
        await vault.flow(context, sender, receiver, 10)
        await expect(
          vault.flow(context, sender, receiver, 1)
        ).to.be.revertedWith("InsufficientBalance")
      })

      it("cannot flow designated tokens", async function () {
        await vault.designate(context, sender, 500)
        await expect(
          vault.flow(context, sender, receiver, 5)
        ).not.to.be.reverted
        await expect(
          vault.flow(context, sender, receiver, 1)
        ).to.be.revertedWith("InsufficientBalance")
      })

      it("cannot transfer tokens that are flowing", async function () {
        await vault.flow(context, sender, receiver, 5)
        await expect(
          vault.transfer(context, sender, receiver, 500)
        ).not.to.be.reverted
        await expect(
          vault.transfer(context, sender, receiver, 1)
        ).to.be.revertedWith("InsufficientBalance")
      })

      it("cannot burn tokens that are flowing", async function () {
        await vault.flow(context, sender, receiver, 5)
        await expect(
          vault.burn(context, sender)
        ).to.be.revertedWith("CannotBurnFlowingTokens")
        await expect(
          vault.burn(context, receiver)
        ).to.be.revertedWith("CannotBurnFlowingTokens")
      })

      it("can burn tokens that are no longer flowing", async function () {
        await vault.flow(context, sender, receiver, 5)
        await vault.flow(context, receiver, sender, 5)
        await expect(vault.burn(context, sender)).not.to.be.reverted
      })
    })
  })
})
