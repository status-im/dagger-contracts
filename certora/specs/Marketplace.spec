using ERC20A as Token;

methods {
    function Token.balanceOf(address) external returns (uint256) envfree;
    function Token.totalSupply() external returns (uint256) envfree;
    function publicPeriodEnd(Periods.Period) external returns (uint256) envfree;
}

/*--------------------------------------------
|              Ghosts and hooks              |
--------------------------------------------*/

ghost mathint sumOfBalances {
    init_state axiom sumOfBalances == 0;
}

ghost mathint requestsCount {
    init_state axiom requestsCount == 0;
}

ghost mathint sumOfAllRequestPrices {
    init_state axiom sumOfAllRequestPrices == 0;
}

hook Sload uint256 balance Token._balances[KEY address addr] {
    require sumOfBalances >= to_mathint(balance);
}

hook Sstore Token._balances[KEY address addr] uint256 newValue (uint256 oldValue) {
    sumOfBalances = sumOfBalances - oldValue + newValue;
}

ghost mathint totalReceived;

hook Sload uint256 defaultValue currentContract._marketplaceTotals.received {
    require totalReceived >= to_mathint(defaultValue);
}

hook Sstore currentContract._marketplaceTotals.received uint256 defaultValue (uint256 defaultValue_old) {
    totalReceived = totalReceived + defaultValue - defaultValue_old;
}

ghost mathint totalSent;

hook Sload uint256 defaultValue currentContract._marketplaceTotals.sent {
    require totalSent >= to_mathint(defaultValue);
}

hook Sstore currentContract._marketplaceTotals.sent uint256 defaultValue (uint256 defaultValue_old) {
    totalSent = totalSent + defaultValue - defaultValue_old;
}

ghost uint256 lastBlockTimestampGhost;

hook TIMESTAMP uint v {
    require lastBlockTimestampGhost <= v;
    lastBlockTimestampGhost = v;
}

ghost mapping(MarketplaceHarness.SlotId => mapping(Periods.Period => bool)) _missingMirror {
    init_state axiom forall MarketplaceHarness.SlotId a.
            forall Periods.Period b.
            _missingMirror[a][b] == false;
}

ghost mapping(MarketplaceHarness.SlotId => uint256) _missedMirror {
    init_state axiom forall MarketplaceHarness.SlotId a.
            _missedMirror[a] == 0;
}

ghost mapping(MarketplaceHarness.SlotId => mathint) _missedCalculated {
    init_state axiom forall MarketplaceHarness.SlotId a.
            _missedCalculated[a] == 0;
}

hook Sload bool defaultValue _missing[KEY MarketplaceHarness.SlotId slotId][KEY Periods.Period period] {
    require _missingMirror[slotId][period] == defaultValue;
}

hook Sstore _missing[KEY MarketplaceHarness.SlotId slotId][KEY Periods.Period period] bool defaultValue {
    _missingMirror[slotId][period] = defaultValue;
    if (defaultValue) {
        _missedCalculated[slotId] = _missedCalculated[slotId] + 1;
    }
}

hook Sload uint256 defaultValue _missed[KEY MarketplaceHarness.SlotId slotId] {
    require _missedMirror[slotId] == defaultValue;
}

hook Sstore _missed[KEY MarketplaceHarness.SlotId slotId] uint256 defaultValue {
    _missedMirror[slotId] = defaultValue;
    if (defaultValue == 0) {
        _missedCalculated[slotId] = 0;
    }
}

ghost mathint requestStateChangesCount {
    init_state axiom requestStateChangesCount == 0;
}

hook Sstore _requestContexts[KEY Marketplace.RequestId requestId].state Marketplace.RequestState newState (Marketplace.RequestState oldState) {
    if (oldState != newState) {
        requestStateChangesCount = requestStateChangesCount + 1;
    }

    if (oldState == Marketplace.RequestState.New && newState == Marketplace.RequestState.Cancelled) {
        uint256 duration = currentContract._requests[requestId].ask.duration;
        uint256 slots = currentContract._requests[requestId].ask.slots;
        uint256 reward = currentContract._requests[requestId].ask.reward;
        sumOfAllRequestPrices = sumOfAllRequestPrices - reward * duration * slots;
    }
}

hook Sstore _requests[KEY Marketplace.RequestId requestId].ask.reward uint256 value (uint256 oldValue) {
    uint256 duration = currentContract._requests[requestId].ask.duration;
    uint256 slots = currentContract._requests[requestId].ask.slots;
    sumOfAllRequestPrices = sumOfAllRequestPrices + value * duration * slots;
}


ghost mathint slotStateChangesCount {
    init_state axiom slotStateChangesCount == 0;
}

hook Sstore _slots[KEY Marketplace.SlotId slotId].state Marketplace.SlotState newState (Marketplace.SlotState oldState) {
    if (oldState != newState) {
        slotStateChangesCount = slotStateChangesCount + 1;
    }
}

// hook Sstore _requests[KEY Marketplace.RequestId requestId].client address value (address oldValue) {
//     if (oldValue == 0 && value != 0) {
//         requestsCount = requestsCount + 1;
//     }
// }

hook Sstore _requestsPerClient[KEY address client]._inner._values[INDEX uint i] bytes32 value (bytes32 oldValue) {
    bytes32 zero = to_bytes32(0);
    if (value != zero && oldValue == value) {
        requestsCount = requestsCount + 1;
    } else {
        // commented out for now that we are only checking balance/requests increase
        // requestsCount = requestsCount - 1;
    }
}

/*--------------------------------------------
|              Helper functions              |
--------------------------------------------*/

function canCancelRequest(method f) returns bool {
    return f.selector == sig:withdrawFunds(Marketplace.RequestId).selector;
}

function canStartRequest(method f) returns bool {
    return f.selector == sig:fillSlot(Marketplace.RequestId, uint256, Marketplace.Groth16Proof).selector;
}

function canFinishRequest(method f) returns bool {
    return f.selector == sig:freeSlot(Marketplace.SlotId, address, address).selector ||
        f.selector == sig:freeSlot(Marketplace.SlotId).selector;
}

function canFailRequest(method f) returns bool {
    return f.selector == sig:markProofAsMissing(Marketplace.SlotId, Periods.Period).selector ||
        f.selector == sig:freeSlot(Marketplace.SlotId, address, address).selector ||
        f.selector == sig:freeSlot(Marketplace.SlotId).selector;
}

/*--------------------------------------------
|                 Invariants                 |
--------------------------------------------*/

invariant totalSupplyIsSumOfBalances()
    to_mathint(Token.totalSupply()) == sumOfBalances;

invariant requestStartedWhenSlotsFilled(env e, Marketplace.RequestId requestId, Marketplace.SlotId slotId)
    currentContract.requestState(e, requestId) == Marketplace.RequestState.Started => to_mathint(currentContract.getRequest(e, requestId).ask.slots) - to_mathint(currentContract.requestContext(e, requestId).slotsFilled) <= to_mathint(currentContract.getRequest(e, requestId).ask.maxSlotLoss);

// STATUS - verified
// https://prover.certora.com/output/6199/6e2383ea040347eabeeb1008bc257ae6?anonymousKey=e1a6a00310a44ed264b1f98b03fa29273e68fca9
invariant slotMissedShouldBeEqualToNumberOfMissedPeriods(env e, Marketplace.SlotId slotId)
    to_mathint(_missedMirror[slotId]) == _missedCalculated[slotId];

// STATUS - verified
// can set missing if period was passed
// https://prover.certora.com/output/3106/026b36c118e44ad0824a51c50647c497/?anonymousKey=29879706f3d343555bb6122d071c9409d4e9876d
invariant cantBeMissedIfInPeriod(MarketplaceHarness.SlotId slotId, Periods.Period period)
    lastBlockTimestampGhost <= publicPeriodEnd(period) => !_missingMirror[slotId][period];

// STATUS - verified
// cancelled request is always expired
// https://prover.certora.com/output/6199/36b12b897f3941faa00fb4ab6871be8e?anonymousKey=de98a02041b841fb2fa67af4222f29fac258249f
invariant cancelledRequestAlwaysExpired(env e, Marketplace.RequestId requestId)
    currentContract.requestState(e, requestId) == Marketplace.RequestState.Cancelled =>
        currentContract.requestExpiry(e, requestId) < lastBlockTimestampGhost;

// STATUS - verified
// failed request is always ended
// https://prover.certora.com/output/6199/902ffe4a83a9438e9860655446b46a74?anonymousKey=47b344024bbfe84a649bd1de44d7d243ce8dbc21
invariant failedRequestAlwaysEnded(env e, Marketplace.RequestId requestId)
    currentContract.requestState(e, requestId) == Marketplace.RequestState.Failed =>
        currentContract.requestContext(e, requestId).endsAt < lastBlockTimestampGhost;

// STATUS - verified
// finished slot always has finished request
// https://prover.certora.com/output/6199/3371ee4f80354ac9b05b1c84c53b6154?anonymousKey=eab83785acb61ccd31ed0c9d5a2e9e2b24099156
invariant finishedSlotAlwaysHasFinishedRequest(env e, Marketplace.SlotId slotId)
    currentContract.slotState(e, slotId) == Marketplace.SlotState.Finished =>
        currentContract.requestState(e, currentContract.slots(e, slotId).requestId) == Marketplace.RequestState.Finished;

// STATUS - verified
// paid slot always has finished or cancelled request
// https://prover.certora.com/output/6199/d0e165ed5d594f9fb477602af06cfeb1?anonymousKey=01ffaad46027786c38d78e5a41c03ce002032200
invariant paidSlotAlwaysHasFinishedOrCancelledRequest(env e, Marketplace.SlotId slotId)
     currentContract.slotState(e, slotId) == Marketplace.SlotState.Paid =>
         currentContract.requestState(e, currentContract.slots(e, slotId).requestId) == Marketplace.RequestState.Finished || currentContract.requestState(e, currentContract.slots(e, slotId).requestId) == Marketplace.RequestState.Cancelled
    { preserved {
        requireInvariant cancelledSlotAlwaysHasCancelledRequest(e, slotId);
      }
    }

// STATUS - verified
// cancelled slot always belongs to cancelled request
// https://prover.certora.com/output/6199/80d5dc73d406436db166071e277283f1?anonymousKey=d5d175960dc40f72e22ba8e31c6904a488277e57
invariant cancelledSlotAlwaysHasCancelledRequest(env e, Marketplace.SlotId slotId)
    currentContract.slotState(e, slotId) == Marketplace.SlotState.Cancelled =>
        currentContract.requestState(e, currentContract.slots(e, slotId).requestId) == Marketplace.RequestState.Cancelled;

invariant requestsCountIsGreaterOrEqualToZero()
    requestsCount >= 0;

/*--------------------------------------------
|                 Properties                 |
--------------------------------------------*/

rule sanity(env e, method f) {
    calldataarg args;
    f(e, args);
    assert true;
    satisfy true;
}

rule totalReceivedCannotDecrease(env e, method f) {
    mathint total_before = totalReceived;

    calldataarg args;
    f(e, args);

    mathint total_after = totalReceived;

    assert total_after >= total_before;
}

rule totalSentCannotDecrease(env e, method f) {
    mathint total_before = totalSent;

    calldataarg args;
    f(e, args);

    mathint total_after = totalSent;

    assert total_after >= total_before;
}

rule slotIsFailedOrFreeIfRequestHasFailed(env e, method f) {
    calldataarg args;
    Marketplace.SlotId slotId;

    requireInvariant paidSlotAlwaysHasFinishedOrCancelledRequest(e, slotId);

    Marketplace.RequestState requestStateBefore = currentContract.requestState(e, currentContract.slots(e, slotId).requestId);
    f(e, args);
    Marketplace.RequestState requestAfter = currentContract.requestState(e, currentContract.slots(e, slotId).requestId);

    assert requestStateBefore != Marketplace.RequestState.Failed && requestAfter == Marketplace.RequestState.Failed => currentContract.slotState(e, slotId) == Marketplace.SlotState.Failed || currentContract.slotState(e, slotId) == Marketplace.SlotState.Free;
}


rule allowedRequestStateChanges(env e, method f) {
    calldataarg args;
    Marketplace.SlotId slotId;

    Marketplace.RequestId requestId = currentContract.slots(e, slotId).requestId;

    // needed, otherwise it finds counter examples where
    // `SlotState.Cancelled` and `RequestState.New`
    requireInvariant cancelledSlotAlwaysHasCancelledRequest(e, slotId);
    // needed, otherwise it finds counter example where
    // `SlotState.Finished` and `RequestState.New`
    requireInvariant finishedSlotAlwaysHasFinishedRequest(e, slotId);

    // Without this, the prover will find counter examples with `requestId == 0`,
    // which are unlikely in practice as `requestId` is a hash from a request object.
    // However, `requestId == 0` enforces `SlotState.Free` in the `fillSlot` function regardless,
    // which ultimately results in counter examples where we have a state change
    // RequestState.Cancelled -> RequestState.Finished, which is forbidden.
    //
    // COUNTER EXAMPLE: https://prover.certora.com/output/6199/3a4f410e6367422ba60b218a08c04fae?anonymousKey=0d7003af4ee9bc18c0da0c80a216a6815d397370
    //
    // The `require` below is a hack to ensure we exclude such cases as the code
    // reverts in `requestIsKnown()` modifier (simply `require requestId != 0` isn't
    // sufficient here)
    require requestId == to_bytes32(0) => currentContract._requests[requestId].client == 0;


    Marketplace.RequestState requestStateBefore = currentContract.requestState(e, requestId);

    // we need to check for `freeSlot(slotId)` here to ensure it's being called with
    // the slotId we're interested in and not any other slotId (that may not pass the
    // required invariants)
    if (f.selector == sig:freeSlot(Marketplace.SlotId).selector || f.selector == sig:freeSlot(Marketplace.SlotId, address, address).selector) {
        freeSlot(e, slotId);
    } else {
        f(e, args);
    }
    Marketplace.RequestState requestStateAfter = currentContract.requestState(e, requestId);

    // RequestState.New -> RequestState.Started
    assert requestStateBefore != requestStateAfter && requestStateAfter == Marketplace.RequestState.Started => requestStateBefore == Marketplace.RequestState.New;

    // RequestState.Started -> RequestState.Finished
    assert requestStateBefore != requestStateAfter && requestStateAfter == Marketplace.RequestState.Finished => requestStateBefore == Marketplace.RequestState.Started;

    // RequestState.Started -> RequestState.Failed
    assert requestStateBefore != requestStateAfter && requestStateAfter == Marketplace.RequestState.Failed => requestStateBefore == Marketplace.RequestState.Started;

    // RequestState.New -> RequestState.Cancelled
    assert requestStateBefore != requestStateAfter && requestStateAfter == Marketplace.RequestState.Cancelled => requestStateBefore == Marketplace.RequestState.New;
}

rule functionsCausingRequestStateChanges(env e, method f) {
    calldataarg args;
    Marketplace.RequestId requestId;

    Marketplace.RequestState requestStateBefore = currentContract.requestState(e, requestId);
    f(e, args);
    Marketplace.RequestState requestStateAfter = currentContract.requestState(e, requestId);

    // RequestState.New -> RequestState.Started
    assert requestStateBefore == Marketplace.RequestState.New && requestStateAfter == Marketplace.RequestState.Started => canStartRequest(f);

    // RequestState.New -> RequestState.Cancelled
    assert requestStateBefore == Marketplace.RequestState.New && requestStateAfter == Marketplace.RequestState.Cancelled => canCancelRequest(f);

    // RequestState.Started -> RequestState.Finished
    assert requestStateBefore == Marketplace.RequestState.Started && requestStateAfter == Marketplace.RequestState.Finished => canFinishRequest(f);

    // RequestState.Started -> RequestState.Failed
    assert requestStateBefore == Marketplace.RequestState.Started && requestStateAfter == Marketplace.RequestState.Failed => canFailRequest(f);
}

rule cancelledRequestsStayCancelled(env e, method f) {

    calldataarg args;
    Marketplace.RequestId requestId;

    Marketplace.RequestState requestStateBefore = currentContract.requestState(e, requestId);

    require requestStateBefore == Marketplace.RequestState.Cancelled;
    requireInvariant cancelledRequestAlwaysExpired(e, requestId);

    f(e, args);
    Marketplace.RequestState requestStateAfter = currentContract.requestState(e, requestId);

    assert requestStateAfter == requestStateBefore;
}

rule finishedRequestsStayFinished(env e, method f) {

    calldataarg args;
    Marketplace.RequestId requestId;

    // Without this, the prover will find counter examples with `requestId == 0`,
    // which are unlikely in practice as `requestId` is a hash from a request object.
    // However, `requestId == 0` enforces `SlotState.Free` in the `fillSlot` function regardless,
    // which ultimately results in counter examples where we have a state change
    // RequestState.Finished -> RequestState.Started, which is forbidden.
    //
    // COUNTER EXAMPLE: https://prover.certora.com/output/6199/81939b2b12d74a5cae5e84ceadb901c0?anonymousKey=a4ad6268598a1077ecfce75493b0c0f9bc3b17a0
    //
    // The `require` below is a hack to ensure we exclude such cases as the code
    // reverts in `requestIsKnown()` modifier (simply `require requestId != 0` isn't
    // sufficient here)
    require requestId == to_bytes32(0) => currentContract._requests[requestId].client == 0;

    Marketplace.RequestState requestStateBefore = currentContract.requestState(e, requestId);
    require requestStateBefore == Marketplace.RequestState.Finished;
    f(e, args);
    Marketplace.RequestState requestStateAfter = currentContract.requestState(e, requestId);

    assert requestStateBefore == requestStateAfter;
}

rule requestStateChangesOnlyOncePerFunctionCall(env e, method f) {
    calldataarg args;
    Marketplace.RequestId requestId;

    mathint requestStateChangesCountBefore = requestStateChangesCount;
    f(e, args);
    mathint requestStateChangesCountAfter = requestStateChangesCount;

    assert requestStateChangesCountAfter <= requestStateChangesCountBefore + 1;
}

rule slotStateChangesOnlyOncePerFunctionCall(env e, method f) {
    calldataarg args;
    Marketplace.SlotId slotId;

    mathint slotStateChangesCountBefore = slotStateChangesCount;
    f(e, args);
    mathint slotStateChangesCountAfter =slotStateChangesCount;

    assert slotStateChangesCountAfter <= slotStateChangesCountBefore + 1;
}

rule contractBalanceIncreasesWhenRequestsAmountIncreases(env e, method f) {
    requireInvariant totalSupplyIsSumOfBalances();
    requireInvariant requestsCountIsGreaterOrEqualToZero();

    calldataarg args;

    mathint balanceBefore = Token.balanceOf(e, currentContract);
    mathint requestsCountBefore = requestsCount;
    mathint sumOfAllRequestPricesBefore = sumOfAllRequestPrices;

    require e.msg.sender != currentContract;
    require e.msg.sender != 0;
    f(e, args);

    mathint balanceAfter = Token.balanceOf(e, currentContract);
    mathint requestsCountAfter = requestsCount;
    mathint sumOfAllRequestPricesAfter = sumOfAllRequestPrices;

    assert requestsCountAfter > requestsCountBefore => sumOfAllRequestPricesAfter >= sumOfAllRequestPricesBefore;
    assert requestsCountAfter > requestsCountBefore => balanceAfter >= balanceBefore + (sumOfAllRequestPricesAfter - sumOfAllRequestPricesBefore);
}
