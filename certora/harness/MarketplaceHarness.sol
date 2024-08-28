// SPDX-License-Identifier: MIT

pragma solidity ^0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IGroth16Verifier} from "../../contracts/Groth16.sol";
import {MarketplaceConfig} from "../../contracts/Configuration.sol";
import {Marketplace} from "../../contracts/Marketplace.sol";
import {RequestId, SlotId} from "../../contracts/Requests.sol";
import {Request} from "../../contracts/Requests.sol";

contract MarketplaceHarness is Marketplace {
    constructor(MarketplaceConfig memory config, IERC20 token, IGroth16Verifier verifier)
        Marketplace(config, token, verifier)
    {}

    function requestContext(RequestId requestId) public returns (Marketplace.RequestContext memory) {
        return _requestContexts[requestId];
    }

    function slots(SlotId slotId) public returns (Marketplace.Slot memory) {
        return _slots[slotId];
    }

    function publicPeriodEnd(Period period) public view returns (uint256) {
        return _periodEnd(period);
    }
}
