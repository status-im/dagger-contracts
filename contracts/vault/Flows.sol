// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./Timestamps.sol";
import "./TokensPerSecond.sol";

struct Flow {
  Timestamp start;
  TokensPerSecond rate;
}

library Flows {
  function _totalAt(
    Flow memory flow,
    Timestamp timestamp
  ) internal pure returns (int128) {
    int128 rate = TokensPerSecond.unwrap(flow.rate);
    Timestamp start = flow.start;
    Timestamp end = timestamp;
    uint64 duration = Timestamp.unwrap(end) - Timestamp.unwrap(start);
    return rate * int128(uint128(duration));
  }
}
