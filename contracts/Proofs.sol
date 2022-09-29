// SPDX-License-Identifier: MIT
pragma solidity ^0.8.8;

contract Proofs {
  type ProofId is bytes32;

  uint256 private immutable period;
  uint256 private immutable timeout;
  uint8 private immutable downtime;

  constructor(
    uint256 __period,
    uint256 __timeout,
    uint8 __downtime
  ) {
    require(block.number > 256, "Insufficient block height");
    period = __period;
    timeout = __timeout;
    downtime = __downtime;
  }

  mapping(ProofId => bool) private ids;
  mapping(ProofId => uint256) private starts;
  mapping(EndId => uint256) private ends;
  mapping(ProofId => EndId) private idEnds;
  mapping(ProofId => uint256) private probabilities;
  mapping(ProofId => uint256) private markers;
  mapping(ProofId => uint256) private missed;
  mapping(ProofId => mapping(uint256 => bool)) private received;
  mapping(ProofId => mapping(uint256 => bool)) private missing;

  function _period() internal view returns (uint256) {
    return period;
  }

  function _timeout() internal view returns (uint256) {
    return timeout;
  }

  function _end(ProofId id) internal view returns (uint256) {
    uint256 end = ends[endId];
    require(end > 0, "Proof ending doesn't exist");
    return ends[endId];
  }

  function _endId(ProofId id) internal view returns (EndId) {
    EndId endId = idEnds[id];
    require(endId > 0, "endId for given id doesn't exist");
    return endId;
  }

  function _endFromId(ProofId id) internal view returns (uint256) {
    EndId endId = _endId(id);
    return _end(endId);
  }

  function _missed(ProofId id) internal view returns (uint256) {
    return missed[id];
  }

  function periodOf(uint256 timestamp) private view returns (uint256) {
    return timestamp / period;
  }

  function currentPeriod() private view returns (uint256) {
    return periodOf(block.timestamp);
  }

  /// @notice Informs the contract that proofs should be expected for id
  /// @dev Requires that the id is not already in use
  /// @param id identifies the proof expectation, typically a slot id
  /// @param endId Identifies the id of the proof expectation ending. Typically a request id. Different from id because the proof ending is shared amongst many ids.
  /// @param probability The probability that a proof should be expected
  function _expectProofs(
    ProofId id, // typically slot id
    EndId endId, // typically request id, used so that the ending is global for all slots
    uint256 probability
  ) internal {
    require(!ids[id], "Proof id already in use");
    ids[id] = true;
    starts[id] = block.timestamp;
    probabilities[id] = probability;
    markers[id] = uint256(blockhash(block.number - 1)) % period;
    idEnds[id] = endId;
  }

  function _unexpectProofs(
    ProofId id
  ) internal {
    require(ids[id], "Proof id not in use");
    ids[id] = false;
  }

  function _getPointer(ProofId id, uint256 proofPeriod)
    internal
    view
    returns (uint8)
  {
    uint256 blockNumber = block.number % 256;
    uint256 periodNumber = proofPeriod % 256;
    uint256 idOffset = uint256(ProofId.unwrap(id)) % 256;
    uint256 pointer = (blockNumber + periodNumber + idOffset) % 256;
    return uint8(pointer);
  }

  function _getPointer(ProofId id) internal view returns (uint8) {
    return _getPointer(id, currentPeriod());
  }

  function _getChallenge(uint8 pointer) internal view returns (bytes32) {
    bytes32 hash = blockhash(block.number - 1 - pointer);
    assert(uint256(hash) != 0);
    return keccak256(abi.encode(hash));
  }

  function _getChallenge(ProofId id, uint256 proofPeriod)
    internal
    view
    returns (bytes32)
  {
    return _getChallenge(_getPointer(id, proofPeriod));
  }

  function _getChallenge(ProofId id) internal view returns (bytes32) {
    return _getChallenge(id, currentPeriod());
  }

  function _getProofRequirement(ProofId id, uint256 proofPeriod)
    internal
    view
    returns (bool isRequired, uint8 pointer)
  {
    if (proofPeriod <= periodOf(starts[id])) {
      return (false, 0);
    }
    uint256 end = _endFromId(id);
    if (proofPeriod >= periodOf(end)) {
      return (false, 0);
    }
    pointer = _getPointer(id, proofPeriod);
    bytes32 challenge = _getChallenge(pointer);
    uint256 probability = (probabilities[id] * (256 - downtime)) / 256;
    isRequired = ids[id] && uint256(challenge) % probability == 0;
  }

  function _isProofRequired(ProofId id, uint256 proofPeriod)
    internal
    view
    returns (bool)
  {
    bool isRequired;
    uint8 pointer;
    (isRequired, pointer) = _getProofRequirement(id, proofPeriod);
    return isRequired && pointer >= downtime;
  }

  function _isProofRequired(ProofId id) internal view returns (bool) {
    return _isProofRequired(id, currentPeriod());
  }

  function _willProofBeRequired(ProofId id) internal view returns (bool) {
    bool isRequired;
    uint8 pointer;
    (isRequired, pointer) = _getProofRequirement(id, currentPeriod());
    return isRequired && pointer < downtime;
  }

  function _submitProof(ProofId id, bytes calldata proof) internal {
    require(proof.length > 0, "Invalid proof"); // TODO: replace by actual check
    require(!received[id][currentPeriod()], "Proof already submitted");
    received[id][currentPeriod()] = true;
    emit ProofSubmitted(id, proof);
  }

  function _markProofAsMissing(ProofId id, uint256 missedPeriod) internal {
    uint256 periodEnd = (missedPeriod + 1) * period;
    require(periodEnd < block.timestamp, "Period has not ended yet");
    require(block.timestamp < periodEnd + timeout, "Validation timed out");
    require(!received[id][missedPeriod], "Proof was submitted, not missing");
    require(_isProofRequired(id, missedPeriod), "Proof was not required");
    require(!missing[id][missedPeriod], "Proof already marked as missing");
    missing[id][missedPeriod] = true;
    missed[id] += 1;
  }

  /// @notice Sets the proof end time
  /// @dev Can only be set once
  /// @param endId the endId of the proofs to extend (typically a request id).
  /// @param ending the new end time (in seconds)
  function _setProofEnd(bytes32 endId, uint256 ending) internal {
    // TODO: create type aliases for id and endId so that _end() can return
    // EndId storage and we don't need to replicate the below require here
    require (ends[endId] == 0 || ending < block.timestamp, "End exists or must be past");
    ends[endId] = ending;
  }

  event ProofSubmitted(ProofId id, bytes proof);
}
