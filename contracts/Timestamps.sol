// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

type Timestamp is uint64;

library Timestamps {
  function currentTime() internal view returns (Timestamp) {
    return Timestamp.wrap(uint64(block.timestamp));
  }

  function isAfter(Timestamp a, Timestamp b) internal pure returns (bool) {
    return Timestamp.unwrap(a) > Timestamp.unwrap(b);
  }

  function isFuture(Timestamp timestamp) internal view returns (bool) {
    return Timestamp.unwrap(timestamp) > block.timestamp;
  }
}
