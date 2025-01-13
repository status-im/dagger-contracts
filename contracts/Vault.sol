// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

using SafeERC20 for IERC20;

contract Vault {
  IERC20 private immutable _token;
  mapping(address => mapping(bytes32 => uint256)) private _amounts;

  constructor(IERC20 token) {
    _token = token;
  }

  function amount(bytes32 id) public view returns (uint256) {
    return _amounts[msg.sender][id];
  }

  function deposit(bytes32 id, address from, uint256 value) public {
    require(_amounts[msg.sender][id] == 0, DepositAlreadyExists(id));
    _amounts[msg.sender][id] = value;
    _token.safeTransferFrom(from, address(this), value);
  }

  function withdraw(bytes32 id, address recipient) public {
    uint256 value = _amounts[msg.sender][id];
    delete _amounts[msg.sender][id];
    _token.safeTransfer(recipient, value);
  }

  error DepositAlreadyExists(bytes32 id);
}
