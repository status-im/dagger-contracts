// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Timestamps.sol";
import "./TokensPerSecond.sol";

using SafeERC20 for IERC20;
using Timestamps for Timestamp;

abstract contract VaultBase {
  IERC20 internal immutable _token;

  type Controller is address;
  type Context is bytes32;
  type Recipient is address;

  struct Balance {
    uint256 available;
    uint256 designated;
  }

  struct Lock {
    Timestamp expiry;
    Timestamp maximum;
  }

  struct Flow {
    Timestamp start;
    TokensPerSecond rate;
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
    Balance memory balance = _balances[controller][context][recipient];
    int256 accumulated = _accumulateFlow(controller, context, recipient);
    if (accumulated >= 0) {
      balance.designated += uint256(accumulated);
    } else {
      balance.available -= uint256(-accumulated);
    }
    return balance;
  }

  function _accumulateFlow(
    Controller controller,
    Context context,
    Recipient recipient
  ) private view returns (int256) {
    Flow memory flow = _flows[controller][context][recipient];
    if (flow.rate == TokensPerSecond.wrap(0)) {
      return 0;
    }
    Timestamp expiry = _getLock(controller, context).expiry;
    Timestamp flowEnd = Timestamps.earliest(Timestamps.currentTime(), expiry);
    uint64 duration = Timestamp.unwrap(flowEnd) - Timestamp.unwrap(flow.start);
    return TokensPerSecond.unwrap(flow.rate) * int256(uint256(duration));
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
    uint256 amount
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
    require(
      _getLock(controller, context).expiry <= Timestamps.currentTime(),
      Locked()
    );
    delete _locks[controller][context];
    Balance memory balance = _getBalance(controller, context, recipient);
    uint256 amount = balance.available + balance.designated;
    _delete(controller, context, recipient);
    _token.safeTransfer(Recipient.unwrap(recipient), amount);
  }

  function _burn(
    Controller controller,
    Context context,
    Recipient recipient
  ) internal {
    Balance memory balance = _getBalance(controller, context, recipient);
    uint256 amount = balance.available + balance.designated;
    _delete(controller, context, recipient);
    _token.safeTransfer(address(0xdead), amount);
  }

  function _transfer(
    Controller controller,
    Context context,
    Recipient from,
    Recipient to,
    uint256 amount
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
    uint256 amount
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
    Lock memory existing = _getLock(controller, context);
    require(existing.maximum == Timestamp.wrap(0), AlreadyLocked());
    require(expiry <= maximum, ExpiryPastMaximum());
    _locks[controller][context] = Lock({expiry: expiry, maximum: maximum});
  }

  function _extendLock(
    Controller controller,
    Context context,
    Timestamp expiry
  ) internal {
    Lock memory existing = _getLock(controller, context);
    require(Timestamps.currentTime() < existing.expiry, LockExpired());
    require(existing.expiry <= expiry, InvalidExpiry());
    require(expiry <= existing.maximum, ExpiryPastMaximum());
    _locks[controller][context].expiry = expiry;
  }

  function _flow(
    Controller controller,
    Context context,
    Recipient from,
    Recipient to,
    TokensPerSecond rate
  ) internal {
    Lock memory lock = _getLock(controller, context);
    Timestamp start = Timestamps.currentTime();
    require(lock.expiry != Timestamp.wrap(0), LockRequired());
    require(start < lock.expiry, LockExpired());
    uint64 duration = Timestamp.unwrap(lock.maximum) - Timestamp.unwrap(start);
    int256 total = int256(uint256(duration)) * TokensPerSecond.unwrap(rate);
    Balance memory balance = _getBalance(controller, context, from);
    require(total <= int256(balance.available), InsufficientBalance());
    _flows[controller][context][to] = Flow({start: start, rate: rate});
    _flows[controller][context][from] = Flow({start: start, rate: -rate});
  }

  error InsufficientBalance();
  error Locked();
  error AlreadyLocked();
  error ExpiryPastMaximum();
  error InvalidExpiry();
  error LockExpired();
  error LockRequired();
}
