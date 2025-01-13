// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./Requests.sol";

contract StateRetrieval {
  using EnumerableSet for EnumerableSet.Bytes32Set;
  using Requests for bytes32[];

  mapping(address => EnumerableSet.Bytes32Set) private _requestsPerClient;
  mapping(address => EnumerableSet.Bytes32Set) private _slotsPerHost;

  function myRequests() public view returns (RequestId[] memory) {
    return _requestsPerClient[msg.sender].values().toRequestIds();
  }

  function mySlots() public view returns (SlotId[] memory) {
    return _slotsPerHost[msg.sender].values().toSlotIds();
  }

  function _hasSlots(address host) internal view returns (bool) {
    return _slotsPerHost[host].length() > 0;
  }

  function _addToMyRequests(address client, RequestId requestId) internal {
    _requestsPerClient[client].add(RequestId.unwrap(requestId));
  }

  function _addToMySlots(address host, SlotId slotId) internal {
    _slotsPerHost[host].add(SlotId.unwrap(slotId));
  }

  function _removeFromMyRequests(address client, RequestId requestId) internal {
    _requestsPerClient[client].remove(RequestId.unwrap(requestId));
  }

  function _removeFromMySlots(address host, SlotId slotId) internal {
    _slotsPerHost[host].remove(SlotId.unwrap(slotId));
  }
}
