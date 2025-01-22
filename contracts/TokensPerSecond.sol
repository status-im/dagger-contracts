// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./Timestamps.sol";

type TokensPerSecond is int256;

using {_negate as -} for TokensPerSecond global;

function _negate(TokensPerSecond rate) pure returns (TokensPerSecond) {
  return TokensPerSecond.wrap(-TokensPerSecond.unwrap(rate));
}
