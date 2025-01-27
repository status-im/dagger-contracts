// SPDX-License-Identifier: MIT

pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IGroth16Verifier} from "../../contracts/Groth16.sol";
import {MarketplaceConfig} from "../../contracts/Configuration.sol";
import {Marketplace} from "../../contracts/Marketplace.sol";
import {Requests, Request, RequestState, SlotState, RequestId, SlotId} from "../../contracts/Requests.sol";

contract MarketplaceHarness is Marketplace {
  using Requests for Request;

  constructor(
    MarketplaceConfig memory config,
    IERC20 token,
    IGroth16Verifier verifier
  ) Marketplace(config, token, verifier) {}

  function publicPeriodEnd(Period period) public view returns (uint256) {
    return _periodEnd(period);
  }

  function slots(SlotId slotId) public view returns (Slot memory) {
    return _slots[slotId];
  }

  function generateSlotId(
    RequestId requestId,
    uint256 slotIndex
  ) public pure returns (SlotId) {
    return Requests.slotId(requestId, slotIndex);
  }

  /******************/
  /* FUNDS TRACKING */
  /******************/

  // TODO: Once reward for submitting missing proof call is implemented, add it here
  // https://github.com/codex-storage/codex-contracts-eth/issues/70

  /**
   * View that returns allocated funds to the host for given request and its slot
   * based on the state of the request/slot.
   */
  function hostRequestSlotFunds(
    RequestId requestId,
    uint256 slotIndex
  ) public view returns (uint256) {
    SlotId slotId = Requests.slotId(requestId, slotIndex);
    Slot memory slot = _slots[slotId];
    SlotState state = slotState(slotId);

    // Payout to hosts is allocated only upon successfully finishing of the Request
    // or partial payout when Request expires
    if (
      state == SlotState.Free ||
      state == SlotState.Filled ||
      state == SlotState.Failed ||
      state == SlotState.Paid
    ) {
      return 0;
    } else if (state == SlotState.Finished) {
      return _slotPayout(requestId, slot.filledAt);
    } else if (state == SlotState.Cancelled) {
      return _slotPayout(requestId, slot.filledAt, requestExpiry(requestId));
    }

    revert("Invalid state");
  }

  /**
   * View that returns allocated funds to the client for given request based
   * on the state of the request.
   */
  function clientRequestFunds(
    RequestId requestId
  ) public view returns (uint256) {
    Request memory request = _requests[requestId];
    RequestState state = requestState(requestId);

    if (
      state == RequestState.New ||
      state == RequestState.Started ||
      state == RequestState.Failed
    ) {
      return request.maxPrice();
    } else if (
      state == RequestState.Finished || state == RequestState.Cancelled
    ) {
      return _requestContexts[requestId].fundsToReturnToClient;
    }

    revert("Invalid state");
  }

  /**
   * View that returns all allocated funds for paying out Request funds
   * Eq. funds that are coming in from Client that pays for Request to be stored
   * and then is splitted between hosts and client based on how the hosting of
   * the Request goes (eq. base on state).
   */
  function allocatedRequestFunds(
    RequestId requestId
  ) public view returns (uint256) {
    uint256 slotsFunds = 0;
    for (uint64 i = 0; i < _requests[requestId].ask.slots; i++) {
      slotsFunds += hostRequestSlotFunds(requestId, i);
    }

    return slotsFunds + clientRequestFunds(requestId);
  }

  function collateralRequestSlotFunds(
    RequestId requestId,
    uint256 slotIndex
  ) public view returns (uint256) {
    SlotId slotId = Requests.slotId(requestId, slotIndex);
    Slot memory slot = _slots[slotId];
    SlotState state = slotState(slotId);

    if (
      state == SlotState.Free ||
      state == SlotState.Filled ||
      state == SlotState.Failed ||
      state == SlotState.Paid
    ) {
      return 0;
    } else if (state == SlotState.Finished || state == SlotState.Cancelled) {
      return slot.currentCollateral;
    }

    revert("Invalid state");
  }

  /**
   * View that returns sum of all collateral funds for given request based on
   * the state of the request and slashing that occured.
   */
  function collateralRequestFunds(
    RequestId requestId
  ) public view returns (uint256) {
    uint256 collateralFunds = 0;
    for (uint64 i = 0; i < _requests[requestId].ask.slots; i++) {
      collateralFunds += collateralRequestSlotFunds(requestId, i);
    }

    return collateralFunds;
  }
}
