// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./VaultBase.sol";

contract Vault is VaultBase {
  // solhint-disable-next-line no-empty-blocks
  constructor(IERC20 token) VaultBase(token) {}

  function balance(
    Context context,
    Recipient recipient
  ) public view returns (uint256) {
    Controller controller = Controller.wrap(msg.sender);
    return _getBalance(controller, context, recipient);
  }

  function designated(
    Context context,
    Recipient recipient
  ) public view returns (uint256) {
    Controller controller = Controller.wrap(msg.sender);
    return _getDesignated(controller, context, recipient);
  }

  function lock(Context context) public view returns (Lock memory) {
    Controller controller = Controller.wrap(msg.sender);
    return _getLock(controller, context);
  }

  function deposit(Context context, address from, uint256 amount) public {
    Controller controller = Controller.wrap(msg.sender);
    _deposit(controller, context, from, amount);
  }

  function withdraw(Context context, Recipient recipient) public {
    Controller controller = Controller.wrap(msg.sender);
    _withdraw(controller, context, recipient);
  }

  function withdrawByRecipient(Controller controller, Context context) public {
    Recipient recipient = Recipient.wrap(msg.sender);
    _withdraw(controller, context, recipient);
  }

  function burn(Context context, Recipient recipient) public {
    Controller controller = Controller.wrap(msg.sender);
    _burn(controller, context, recipient);
  }

  function transfer(
    Context context,
    Recipient from,
    Recipient to,
    uint256 amount
  ) public {
    Controller controller = Controller.wrap(msg.sender);
    _transfer(controller, context, from, to, amount);
  }

  function designate(
    Context context,
    Recipient recipient,
    uint256 amount
  ) public {
    Controller controller = Controller.wrap(msg.sender);
    _designate(controller, context, recipient, amount);
  }

  function lockup(Context context, Timestamp expiry, Timestamp maximum) public {
    Controller controller = Controller.wrap(msg.sender);
    _lockup(controller, context, expiry, maximum);
  }

  function extend(Context context, Timestamp expiry) public {
    Controller controller = Controller.wrap(msg.sender);
    _extendLock(controller, context, expiry);
  }

  function flow(
    Context context,
    Recipient from,
    Recipient to,
    TokensPerSecond rate
  ) public {
    Controller controller = Controller.wrap(msg.sender);
    _flow(controller, context, from, to, rate);
  }
}
