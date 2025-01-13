// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

contract Endian {
  /// reverses byte order to allow conversion between little endian and big
  /// endian integers
  function _byteSwap(bytes32 input) internal pure returns (bytes32 output) {
    output = output | bytes1(input);
    for (uint i = 1; i < 32; i++) {
      output = output >> 8;
      output = output | bytes1(input << (i * 8));
    }
  }
}
