// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./Timestamps.sol";

type TokensPerSecond is int256;

using {_tokensPerSecondNegate as -} for TokensPerSecond global;
using {_tokensPerSecondEquals as ==} for TokensPerSecond global;

function _tokensPerSecondNegate(
  TokensPerSecond rate
) pure returns (TokensPerSecond) {
  return TokensPerSecond.wrap(-TokensPerSecond.unwrap(rate));
}

function _tokensPerSecondEquals(
  TokensPerSecond a,
  TokensPerSecond b
) pure returns (bool) {
  return TokensPerSecond.unwrap(a) == TokensPerSecond.unwrap(b);
}
