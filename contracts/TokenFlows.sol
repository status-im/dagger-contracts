// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./Timestamps.sol";

type TokensPerSecond is int256;

using {_negate as -} for TokensPerSecond global;

function _negate(TokensPerSecond rate) pure returns (TokensPerSecond) {
  return TokensPerSecond.wrap(-TokensPerSecond.unwrap(rate));
}

library TokenFlows {
  function accumulated(
    TokensPerSecond rate,
    Timestamp start,
    Timestamp end
  ) internal pure returns (int256) {
    if (TokensPerSecond.unwrap(rate) == 0) {
      return 0;
    }
    uint64 duration = Timestamp.unwrap(end) - Timestamp.unwrap(start);
    return TokensPerSecond.unwrap(rate) * int256(uint256(duration));
  }
}
