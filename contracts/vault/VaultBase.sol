// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Timestamps.sol";
import "./TokensPerSecond.sol";
import "./Flows.sol";
import "./Locks.sol";

using SafeERC20 for IERC20;
using Timestamps for Timestamp;
using Flows for Flow;
using Locks for Lock;

abstract contract VaultBase {
  IERC20 internal immutable _token;

  type Controller is address;
  type Context is bytes32;
  type Recipient is address;

  struct Balance {
    uint128 available;
    uint128 designated;
  }

  mapping(Controller => mapping(Context => Lock)) private _locks;
  mapping(Controller => mapping(Context => mapping(Recipient => Balance)))
    private _balances;
  mapping(Controller => mapping(Context => mapping(Recipient => Flow)))
    private _flows;

  constructor(IERC20 token) {
    _token = token;
  }

  function _getBalance(
    Controller controller,
    Context context,
    Recipient recipient
  ) internal view returns (Balance memory) {
    Balance storage balance = _balances[controller][context][recipient];
    Flow storage flow = _flows[controller][context][recipient];
    Lock storage lock = _locks[controller][context];
    Timestamp timestamp = Timestamps.currentTime();
    return _getBalanceAt(balance, flow, lock, timestamp);
  }

  function _getBalanceAt(
    Balance memory balance,
    Flow memory flow,
    Lock storage lock,
    Timestamp timestamp
  ) private view returns (Balance memory) {
    Balance memory result = balance;
    if (flow.rate != TokensPerSecond.wrap(0)) {
      Timestamp end = Timestamps.earliest(timestamp, lock.expiry);
      int128 accumulated = flow._totalAt(end);
      if (accumulated >= 0) {
        result.designated += uint128(accumulated);
      } else {
        result.available -= uint128(-accumulated);
      }
    }
    return result;
  }

  function _getLock(
    Controller controller,
    Context context
  ) internal view returns (Lock memory) {
    return _locks[controller][context];
  }

  function _deposit(
    Controller controller,
    Context context,
    address from,
    uint128 amount
  ) internal {
    Recipient recipient = Recipient.wrap(from);
    _balances[controller][context][recipient].available += amount;
    _token.safeTransferFrom(from, address(this), amount);
  }

  function _delete(
    Controller controller,
    Context context,
    Recipient recipient
  ) private {
    delete _balances[controller][context][recipient];
  }

  function _withdraw(
    Controller controller,
    Context context,
    Recipient recipient
  ) internal {
    require(!_locks[controller][context].isLocked(), Locked());
    delete _locks[controller][context];
    Balance memory balance = _getBalance(controller, context, recipient);
    uint128 amount = balance.available + balance.designated;
    _delete(controller, context, recipient);
    _token.safeTransfer(Recipient.unwrap(recipient), amount);
  }

  function _burn(
    Controller controller,
    Context context,
    Recipient recipient
  ) internal {
    Balance memory balance = _getBalance(controller, context, recipient);
    uint128 amount = balance.available + balance.designated;
    _delete(controller, context, recipient);
    _token.safeTransfer(address(0xdead), amount);
  }

  function _transfer(
    Controller controller,
    Context context,
    Recipient from,
    Recipient to,
    uint128 amount
  ) internal {
    Balance memory senderBalance = _getBalance(controller, context, from);
    Balance memory receiverBalance = _getBalance(controller, context, to);
    require(amount <= senderBalance.available, InsufficientBalance());

    senderBalance.available -= amount;
    receiverBalance.available += amount;

    Flow memory senderFlow = _flows[controller][context][from];
    Lock memory lock = _locks[controller][context];
    _checkFlowInvariant(senderBalance, lock, senderFlow);

    _balances[controller][context][from] = senderBalance;
    _balances[controller][context][to] = receiverBalance;
  }

  function _designate(
    Controller controller,
    Context context,
    Recipient recipient,
    uint128 amount
  ) internal {
    Balance storage balance = _balances[controller][context][recipient];
    require(amount <= balance.available, InsufficientBalance());
    balance.available -= amount;
    balance.designated += amount;
  }

  function _lockup(
    Controller controller,
    Context context,
    Timestamp expiry,
    Timestamp maximum
  ) internal {
    Lock memory lock = _locks[controller][context];
    require(lock.maximum == Timestamp.wrap(0), AlreadyLocked());
    lock.expiry = expiry;
    lock.maximum = maximum;
    _checkLockInvariant(lock);
    _locks[controller][context] = lock;
  }

  function _extendLock(
    Controller controller,
    Context context,
    Timestamp expiry
  ) internal {
    Lock memory lock = _locks[controller][context];
    require(lock.isLocked(), LockRequired());
    require(lock.expiry <= expiry, InvalidExpiry());
    lock.expiry = expiry;
    _checkLockInvariant(lock);
    _locks[controller][context] = lock;
  }

  function _flow(
    Controller controller,
    Context context,
    Recipient from,
    Recipient to,
    TokensPerSecond rate
  ) internal {
    require(rate >= TokensPerSecond.wrap(0), NegativeFlow());

    Lock memory lock = _locks[controller][context];
    require(lock.isLocked(), LockRequired());

    Balance memory senderBalance = _getBalance(controller, context, from);
    Balance memory receiverBalance = _getBalance(controller, context, to);
    Flow memory senderFlow = _flows[controller][context][from];
    Flow memory receiverFlow = _flows[controller][context][to];

    Timestamp start = Timestamps.currentTime();
    senderFlow.start = start;
    senderFlow.rate = senderFlow.rate - rate;
    receiverFlow.start = start;
    receiverFlow.rate = receiverFlow.rate + rate;

    _checkFlowInvariant(senderBalance, lock, senderFlow);

    _balances[controller][context][from] = senderBalance;
    _balances[controller][context][to] = receiverBalance;
    _flows[controller][context][from] = senderFlow;
    _flows[controller][context][to] = receiverFlow;
  }

  function _checkLockInvariant(Lock memory lock) private pure {
    require(lock.expiry <= lock.maximum, ExpiryPastMaximum());
  }

  function _checkFlowInvariant(
    Balance memory balance,
    Lock memory lock,
    Flow memory flow
  ) private pure {
    if (flow.rate < TokensPerSecond.wrap(0)) {
      uint128 outgoing = uint128(-flow._totalAt(lock.maximum));
      require(outgoing <= balance.available, InsufficientBalance());
    }
  }

  error InsufficientBalance();
  error Locked();
  error AlreadyLocked();
  error ExpiryPastMaximum();
  error InvalidExpiry();
  error LockRequired();
  error NegativeFlow();
}
