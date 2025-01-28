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
    require(
      amount <= _balances[controller][context][from].available,
      InsufficientBalance()
    );
    _balances[controller][context][from].available -= amount;
    _balances[controller][context][to].available += amount;
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
    require(expiry <= maximum, ExpiryPastMaximum());
    Lock memory existing = _locks[controller][context];
    require(existing.maximum == Timestamp.wrap(0), AlreadyLocked());
    _locks[controller][context] = Lock({expiry: expiry, maximum: maximum});
  }

  function _extendLock(
    Controller controller,
    Context context,
    Timestamp expiry
  ) internal {
    Lock memory lock = _locks[controller][context];
    require(lock.isLocked(), LockRequired());
    require(lock.expiry <= expiry, InvalidExpiry());
    require(expiry <= lock.maximum, ExpiryPastMaximum());
    _locks[controller][context].expiry = expiry;
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

    Timestamp start = Timestamps.currentTime();
    Flow memory senderFlow = _flows[controller][context][from];
    senderFlow.start = start;
    senderFlow.rate = senderFlow.rate - rate;
    Flow memory receiverFlow = _flows[controller][context][to];
    receiverFlow.start = start;
    receiverFlow.rate = receiverFlow.rate + rate;

    Balance memory senderBalance = _getBalance(controller, context, from);
    uint128 flowMaximum = uint128(-senderFlow._totalAt(lock.maximum));
    require(flowMaximum <= senderBalance.available, InsufficientBalance());

    _flows[controller][context][from] = senderFlow;
    _flows[controller][context][to] = receiverFlow;
  }

  error InsufficientBalance();
  error Locked();
  error AlreadyLocked();
  error ExpiryPastMaximum();
  error InvalidExpiry();
  error LockRequired();
  error NegativeFlow();
}
