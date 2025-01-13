// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./Endian.sol";

contract TestEndian is Endian {
  function byteSwap(bytes32 input) public pure returns (bytes32) {
    return _byteSwap(input);
  }
}
