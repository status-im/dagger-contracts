// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Timestamps.sol";

using SafeERC20 for IERC20;
using Timestamps for Timestamp;

contract Vault {
  IERC20 private immutable _token;

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

  function balance(
    Context context,
    Recipient recipient
  ) public view returns (uint256) {
    Controller controller = Controller.wrap(msg.sender);
    return
      _available[controller][context][recipient] +
      _designated[controller][context][recipient];
  }

  function designated(
    Context context,
    Recipient recipient
  ) public view returns (uint256) {
    Controller controller = Controller.wrap(msg.sender);
    return _designated[controller][context][recipient];
  }

  function lock(Context context) public view returns (Lock memory) {
    Controller controller = Controller.wrap(msg.sender);
    return _locks[controller][context];
  }

  function deposit(Context context, address from, uint256 amount) public {
    Controller controller = Controller.wrap(msg.sender);
    Recipient recipient = Recipient.wrap(from);
    _available[controller][context][recipient] += amount;
    _token.safeTransferFrom(from, address(this), amount);
  }

  function _delete(Context context, Recipient recipient) private {
    Controller controller = Controller.wrap(msg.sender);
    delete _available[controller][context][recipient];
    delete _designated[controller][context][recipient];
  }

  function withdraw(Context context, Recipient recipient) public {
    Controller controller = Controller.wrap(msg.sender);
    require(!lock(context).expiry.isFuture(), Locked());
    delete _locks[controller][context];
    uint256 amount = balance(context, recipient);
    _delete(context, recipient);
    _token.safeTransfer(Recipient.unwrap(recipient), amount);
  }

  function burn(Context context, Recipient recipient) public {
    uint256 amount = balance(context, recipient);
    _delete(context, recipient);
    _token.safeTransfer(address(0xdead), amount);
  }

  function transfer(
    Context context,
    Recipient from,
    Recipient to,
    uint256 amount
  ) public {
    Controller controller = Controller.wrap(msg.sender);
    require(
      amount <= _available[controller][context][from],
      InsufficientBalance()
    );
    _available[controller][context][from] -= amount;
    _available[controller][context][to] += amount;
  }

  function designate(
    Context context,
    Recipient recipient,
    uint256 amount
  ) public {
    Controller controller = Controller.wrap(msg.sender);
    require(
      amount <= _available[controller][context][recipient],
      InsufficientBalance()
    );
    _available[controller][context][recipient] -= amount;
    _designated[controller][context][recipient] += amount;
  }

  function lockup(Context context, Timestamp expiry, Timestamp maximum) public {
    require(Timestamp.unwrap(lock(context).maximum) == 0, AlreadyLocked());
    require(!expiry.isAfter(maximum), ExpiryPastMaximum());
    Controller controller = Controller.wrap(msg.sender);
    _locks[controller][context] = Lock({expiry: expiry, maximum: maximum});
  }

  function extend(Context context, Timestamp expiry) public {
    Lock memory previous = lock(context);
    require(previous.expiry.isFuture(), LockExpired());
    require(!previous.expiry.isAfter(expiry), InvalidExpiry());
    require(!expiry.isAfter(previous.maximum), ExpiryPastMaximum());
    Controller controller = Controller.wrap(msg.sender);
    _locks[controller][context].expiry = expiry;
  }

  error InsufficientBalance();
  error Locked();
  error AlreadyLocked();
  error ExpiryPastMaximum();
  error InvalidExpiry();
  error LockExpired();
}
