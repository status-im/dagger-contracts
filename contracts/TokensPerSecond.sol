// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./Timestamps.sol";

type TokensPerSecond is int256;

using {_negate as -} for TokensPerSecond global;
using {_equals as ==} for TokensPerSecond global;

function _negate(TokensPerSecond rate) pure returns (TokensPerSecond) {
  return TokensPerSecond.wrap(-TokensPerSecond.unwrap(rate));
}

function _equals(TokensPerSecond a, TokensPerSecond b) pure returns (bool) {
  return TokensPerSecond.unwrap(a) == TokensPerSecond.unwrap(b);
}
