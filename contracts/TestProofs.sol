// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./Proofs.sol";

// exposes internal functions of Proofs for testing
contract TestProofs is Proofs {
  mapping(SlotId => SlotState) private _states;

  constructor(
    ProofConfig memory config,
    IGroth16Verifier verifier
  ) Proofs(config, verifier) {} // solhint-disable-line no-empty-blocks

  function slotState(SlotId slotId) public view override returns (SlotState) {
    return _states[slotId];
  }

  function startRequiringProofs(SlotId slot, uint256 probability) public {
    _startRequiringProofs(slot, probability);
  }

  function markProofAsMissing(SlotId id, Period period) public {
    _markProofAsMissing(id, period);
  }

  function proofReceived(
    SlotId id,
    Groth16Proof calldata proof,
    uint[] memory pubSignals
  ) public {
    _proofReceived(id, proof, pubSignals);
  }

  function setSlotState(SlotId id, SlotState state) public {
    _states[id] = state;
  }
}
