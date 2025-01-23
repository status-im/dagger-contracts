// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

type Timestamp is uint64;

using {_notEquals as !=} for Timestamp global;
using {_lessThan as <} for Timestamp global;
using {_atMost as <=} for Timestamp global;

function _notEquals(Timestamp a, Timestamp b) pure returns (bool) {
  return Timestamp.unwrap(a) != Timestamp.unwrap(b);
}

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

  function earliest(
    Timestamp a,
    Timestamp b
  ) internal pure returns (Timestamp) {
    if (a <= b) {
      return a;
    } else {
      return b;
    }
  }
}
