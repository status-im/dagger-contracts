// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "./Timestamps.sol";

struct Lock {
  Timestamp expiry;
  Timestamp maximum;
}

library Locks {
  function isLocked(Lock memory lock) internal view returns (bool) {
    return Timestamps.currentTime() < lock.expiry;
  }
}
