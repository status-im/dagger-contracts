// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./Timestamps.sol";

type TokensPerSecond is int128;

using {_tokensPerSecondNegate as -} for TokensPerSecond global;
using {_tokensPerSecondMinus as -} for TokensPerSecond global;
using {_tokensPerSecondPlus as +} for TokensPerSecond global;
using {_tokensPerSecondEquals as ==} for TokensPerSecond global;
using {_tokensPerSecondNotEqual as !=} for TokensPerSecond global;
using {_tokensPerSecondAtLeast as >=} for TokensPerSecond global;
using {_tokensPerSecondLessThan as <} for TokensPerSecond global;

function _tokensPerSecondNegate(
  TokensPerSecond rate
) pure returns (TokensPerSecond) {
  return TokensPerSecond.wrap(-TokensPerSecond.unwrap(rate));
}

function _tokensPerSecondMinus(
  TokensPerSecond a,
  TokensPerSecond b
) pure returns (TokensPerSecond) {
  return
    TokensPerSecond.wrap(TokensPerSecond.unwrap(a) - TokensPerSecond.unwrap(b));
}

function _tokensPerSecondPlus(
  TokensPerSecond a,
  TokensPerSecond b
) pure returns (TokensPerSecond) {
  return
    TokensPerSecond.wrap(TokensPerSecond.unwrap(a) + TokensPerSecond.unwrap(b));
}

function _tokensPerSecondEquals(
  TokensPerSecond a,
  TokensPerSecond b
) pure returns (bool) {
  return TokensPerSecond.unwrap(a) == TokensPerSecond.unwrap(b);
}

function _tokensPerSecondNotEqual(
  TokensPerSecond a,
  TokensPerSecond b
) pure returns (bool) {
  return TokensPerSecond.unwrap(a) != TokensPerSecond.unwrap(b);
}

function _tokensPerSecondAtLeast(
  TokensPerSecond a,
  TokensPerSecond b
) pure returns (bool) {
  return TokensPerSecond.unwrap(a) >= TokensPerSecond.unwrap(b);
}

function _tokensPerSecondLessThan(
  TokensPerSecond a,
  TokensPerSecond b
) pure returns (bool) {
  return TokensPerSecond.unwrap(a) < TokensPerSecond.unwrap(b);
}
