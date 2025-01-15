// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

using SafeERC20 for IERC20;

contract Vault {
  IERC20 private immutable _token;

  type Controller is address;
  type Context is bytes32;
  type Recipient is address;

  mapping(Controller => mapping(Context => mapping(Recipient => uint256)))
    private _available;

  constructor(IERC20 token) {
    _token = token;
  }

  function balance(
    Context context,
    Recipient recipient
  ) public view returns (uint256) {
    Controller controller = Controller.wrap(msg.sender);
    return _available[controller][context][recipient];
  }

  function deposit(Context context, address from, uint256 amount) public {
    Controller controller = Controller.wrap(msg.sender);
    Recipient recipient = Recipient.wrap(from);
    _available[controller][context][recipient] += amount;
    _token.safeTransferFrom(from, address(this), amount);
  }

  function withdraw(Context context, Recipient recipient) public {
    Controller controller = Controller.wrap(msg.sender);
    uint256 amount = _available[controller][context][recipient];
    delete _available[controller][context][recipient];
    _token.safeTransfer(Recipient.unwrap(recipient), amount);
  }

  function burn(Context context, Recipient recipient) public {
    Controller controller = Controller.wrap(msg.sender);
    uint256 amount = _available[controller][context][recipient];
    delete _available[controller][context][recipient];
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

  error InsufficientBalance();
}
