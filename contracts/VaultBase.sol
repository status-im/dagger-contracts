// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Timestamps.sol";

using SafeERC20 for IERC20;
using Timestamps for Timestamp;

abstract contract VaultBase {
  IERC20 internal immutable _token;

  type Controller is address;
  type Context is bytes32;
  type Recipient is address;

  struct Lock {
    Timestamp expiry;
    Timestamp maximum;
  }

  mapping(Controller => mapping(Context => Lock)) private _locks;
  mapping(Controller => mapping(Context => mapping(Recipient => uint256)))
    private _available;
  mapping(Controller => mapping(Context => mapping(Recipient => uint256)))
    private _designated;

  constructor(IERC20 token) {
    _token = token;
  }

  function _getBalance(
    Controller controller,
    Context context,
    Recipient recipient
  ) internal view returns (uint256) {
    return
      _available[controller][context][recipient] +
      _designated[controller][context][recipient];
  }

  function _getDesignated(
    Controller controller,
    Context context,
    Recipient recipient
  ) internal view returns (uint256) {
    return _designated[controller][context][recipient];
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
    _available[controller][context][recipient] += amount;
    _token.safeTransferFrom(from, address(this), amount);
  }

  function _delete(
    Controller controller,
    Context context,
    Recipient recipient
  ) private {
    delete _available[controller][context][recipient];
    delete _designated[controller][context][recipient];
  }

  function _withdraw(
    Controller controller,
    Context context,
    Recipient recipient
  ) internal {
    require(!_getLock(controller, context).expiry.isFuture(), Locked());
    delete _locks[controller][context];
    uint256 amount = _getBalance(controller, context, recipient);
    _delete(controller, context, recipient);
    _token.safeTransfer(Recipient.unwrap(recipient), amount);
  }

  function _burn(
    Controller controller,
    Context context,
    Recipient recipient
  ) internal {
    uint256 amount = _getBalance(controller, context, recipient);
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
      amount <= _available[controller][context][from],
      InsufficientBalance()
    );
    _available[controller][context][from] -= amount;
    _available[controller][context][to] += amount;
  }

  function _designate(
    Controller controller,
    Context context,
    Recipient recipient,
    uint256 amount
  ) internal {
    require(
      amount <= _available[controller][context][recipient],
      InsufficientBalance()
    );
    _available[controller][context][recipient] -= amount;
    _designated[controller][context][recipient] += amount;
  }

  function _lockup(
    Controller controller,
    Context context,
    Timestamp expiry,
    Timestamp maximum
  ) internal {
    require(
      Timestamp.unwrap(_getLock(controller, context).maximum) == 0,
      AlreadyLocked()
    );
    require(!expiry.isAfter(maximum), ExpiryPastMaximum());
    _locks[controller][context] = Lock({expiry: expiry, maximum: maximum});
  }

  function _extendLock(
    Controller controller,
    Context context,
    Timestamp expiry
  ) internal {
    Lock memory previous = _getLock(controller, context);
    require(previous.expiry.isFuture(), LockExpired());
    require(!previous.expiry.isAfter(expiry), InvalidExpiry());
    require(!expiry.isAfter(previous.maximum), ExpiryPastMaximum());
    _locks[controller][context].expiry = expiry;
  }

  error InsufficientBalance();
  error Locked();
  error AlreadyLocked();
  error ExpiryPastMaximum();
  error InvalidExpiry();
  error LockExpired();
}
