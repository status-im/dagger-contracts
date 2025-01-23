// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

type Timestamp is uint64;

using {_lessThan as <} for Timestamp global;
using {_atMost as <=} for Timestamp global;

function _lessThan(Timestamp a, Timestamp b) pure returns (bool) {
  return Timestamp.unwrap(a) < Timestamp.unwrap(b);
}

function _atMost(Timestamp a, Timestamp b) pure returns (bool) {
  return Timestamp.unwrap(a) <= Timestamp.unwrap(b);
}

library Timestamps {
  function currentTime() internal view returns (Timestamp) {
    return Timestamp.wrap(uint64(block.timestamp));
  }
}
