// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./vault/VaultBase.sol";

contract Vault is VaultBase {
  // solhint-disable-next-line no-empty-blocks
  constructor(IERC20 token) VaultBase(token) {}

  function getBalance(
    Context context,
    Recipient recipient
  ) public view returns (uint128) {
    Controller controller = Controller.wrap(msg.sender);
    Balance memory b = _getBalance(controller, context, recipient);
    return b.available + b.designated;
  }

  function getDesignatedBalance(
    Context context,
    Recipient recipient
  ) public view returns (uint128) {
    Controller controller = Controller.wrap(msg.sender);
    Balance memory b = _getBalance(controller, context, recipient);
    return b.designated;
  }

  function getLock(Context context) public view returns (Lock memory) {
    Controller controller = Controller.wrap(msg.sender);
    return _getLock(controller, context);
  }

  function deposit(Context context, address from, uint128 amount) public {
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
    uint128 amount
  ) public {
    Controller controller = Controller.wrap(msg.sender);
    _transfer(controller, context, from, to, amount);
  }

  function designate(
    Context context,
    Recipient recipient,
    uint128 amount
  ) public {
    Controller controller = Controller.wrap(msg.sender);
    _designate(controller, context, recipient, amount);
  }

  function lock(Context context, Timestamp expiry, Timestamp maximum) public {
    Controller controller = Controller.wrap(msg.sender);
    _lockup(controller, context, expiry, maximum);
  }

  function extendLock(Context context, Timestamp expiry) public {
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
