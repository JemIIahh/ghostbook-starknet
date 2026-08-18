//! Tests for the GhostBook conditional-order anonymizer.
//!
//! Coverage: happy-path fill and note deposit, pool-only access, slice cap, total budget,
//! interval pacing, expiry, limit price, partial-fill rejection, exact-funding requirement,
//! plan/pool-key consistency, and plan-hash keying (salt isolates budgets).

use ghostbook_anonymizer::ghostbook_anonymizer::{
    IGhostBookAnonymizerDispatcherTrait, OrderPlan, PlanState,
};
use ghostbook_anonymizer::tests::test_utils::{
    NOTE_ID, POOL, SLICE, START_TS, STRANGER, allowance, balance_of, dispatcher, fill,
    fill_without_funding, mint, plan_for, pool_key, set_consumption, set_ignore_minimum, set_rate,
    setup,
};
use privacy::objects::OpenNoteDeposit;
use snforge_std::{CheatSpan, cheat_caller_address, start_cheat_block_timestamp_global};

#[test]
fn test_fill_happy_path() {
    let fixture = setup();
    let plan = plan_for(fixture);

    let deposits = fill(fixture, plan, SLICE);

    assert_eq!(
        deposits,
        [OpenNoteDeposit { note_id: NOTE_ID, token: fixture.token_out, amount: SLICE }].span(),
    );
    // Input left the anonymizer, output arrived and is approved for the pool to pull.
    assert_eq!(balance_of(fixture.token_in, fixture.anonymizer), 0);
    assert_eq!(balance_of(fixture.token_out, fixture.anonymizer), SLICE);
    assert_eq!(allowance(fixture.token_out, fixture.anonymizer, POOL), SLICE);

    let plan_hash = dispatcher(fixture).compute_plan_hash(plan);
    assert_eq!(
        dispatcher(fixture).get_plan_state(plan_hash),
        PlanState { filled: SLICE, received: SLICE, last_fill_at: START_TS, fills: 1 },
    );
    assert_eq!(dispatcher(fixture).remaining(plan), SLICE * 2);
}

#[test]
fn test_better_than_limit_price_is_kept() {
    let fixture = setup();
    let plan = plan_for(fixture);
    // Market pays 1.5x the limit price.
    set_rate(fixture, 3, 2);

    let deposits = fill(fixture, plan, SLICE);

    assert_eq!(
        deposits,
        [OpenNoteDeposit { note_id: NOTE_ID, token: fixture.token_out, amount: SLICE * 3 / 2 }]
            .span(),
    );
    assert_eq!(balance_of(fixture.token_out, fixture.anonymizer), SLICE * 3 / 2);
}

#[test]
#[should_panic(expected: 'NOT_PRIVACY_POOL')]
fn test_only_privacy_pool_can_fill() {
    let fixture = setup();
    let plan = plan_for(fixture);
    mint(plan.token_in, fixture.anonymizer, SLICE);

    cheat_caller_address(fixture.anonymizer, STRANGER, CheatSpan::TargetCalls(1));
    dispatcher(fixture).privacy_invoke(plan, fixture.router, SLICE, 0, NOTE_ID);
}

#[test]
#[should_panic(expected: 'SLICE_TOO_LARGE')]
fn test_slice_cap_enforced() {
    let fixture = setup();
    let plan = plan_for(fixture);
    fill(fixture, plan, SLICE + 1);
}

#[test]
#[should_panic(expected: 'PLAN_EXHAUSTED')]
fn test_total_budget_enforced_across_fills() {
    let fixture = setup();
    let plan = plan_for(fixture);

    let mut ts = START_TS;
    // Three slices exhaust `total_amount`.
    for _ in 0..3_u8 {
        start_cheat_block_timestamp_global(ts);
        fill(fixture, plan, SLICE);
        ts += plan.min_interval;
    }
    let plan_hash = dispatcher(fixture).compute_plan_hash(plan);
    assert_eq!(dispatcher(fixture).get_plan_state(plan_hash).fills, 3);
    assert_eq!(dispatcher(fixture).remaining(plan), 0);

    // The fourth is refused even though the caller is the pool and funds are present.
    start_cheat_block_timestamp_global(ts);
    fill(fixture, plan, SLICE);
}

#[test]
#[should_panic(expected: 'INTERVAL_NOT_ELAPSED')]
fn test_min_interval_enforced() {
    let fixture = setup();
    let plan = plan_for(fixture);
    fill(fixture, plan, SLICE);
    // Same block: the schedule forbids a second slice.
    fill(fixture, plan, SLICE);
}

#[test]
fn test_fill_allowed_once_interval_elapsed() {
    let fixture = setup();
    let plan = plan_for(fixture);
    fill(fixture, plan, SLICE);

    start_cheat_block_timestamp_global(START_TS + plan.min_interval);
    fill(fixture, plan, SLICE);

    let plan_hash = dispatcher(fixture).compute_plan_hash(plan);
    let state = dispatcher(fixture).get_plan_state(plan_hash);
    assert_eq!(state.fills, 2);
    assert_eq!(state.filled, SLICE * 2);
    assert_eq!(state.last_fill_at, START_TS + plan.min_interval);
}

#[test]
#[should_panic(expected: 'PLAN_EXPIRED')]
fn test_expiry_enforced() {
    let fixture = setup();
    let plan = plan_for(fixture);
    start_cheat_block_timestamp_global(plan.expiry + 1);
    fill(fixture, plan, SLICE);
}

#[test]
#[should_panic(expected: 'CLEAR_MINIMUM_NOT_MET')]
fn test_limit_price_enforced_by_router_minimum() {
    let fixture = setup();
    let plan = plan_for(fixture);
    // Market pays 0.9x — below the committed limit, so `clear_minimum` rejects the payout.
    set_rate(fixture, 9, 10);
    fill(fixture, plan, SLICE);
}

#[test]
#[should_panic(expected: 'LIMIT_PRICE_NOT_MET')]
fn test_limit_price_enforced_by_anonymizer() {
    let fixture = setup();
    let plan = plan_for(fixture);
    // A router that pays out below the requested minimum is still caught by the anonymizer.
    set_rate(fixture, 9, 10);
    set_ignore_minimum(fixture, true);
    fill(fixture, plan, SLICE);
}

#[test]
#[should_panic(expected: 'IN_TOKEN_NOT_CLEARED')]
fn test_partial_fill_rejected() {
    let fixture = setup();
    let plan = plan_for(fixture);
    // Router consumes half the input: a partial fill.
    set_consumption(fixture, 1, 2);
    fill(fixture, plan, SLICE);
}

#[test]
#[should_panic(expected: 'BALANCE_NOT_SLICE')]
fn test_requires_exact_slice_funding() {
    let fixture = setup();
    let plan = plan_for(fixture);
    mint(plan.token_in, fixture.anonymizer, SLICE + 1);
    fill_without_funding(fixture, plan, SLICE);
}

#[test]
#[should_panic(expected: 'TOKEN_MISMATCH_POOL_KEY')]
fn test_token_must_belong_to_pool_key() {
    let fixture = setup();
    let mut plan = plan_for(fixture);
    // Pool key that does not contain `token_in`.
    plan.pool_key = pool_key(fixture.token_out, STRANGER);
    fill(fixture, plan, SLICE);
}

#[test]
#[should_panic(expected: 'ZERO_LIMIT')]
fn test_limit_price_must_be_set() {
    let fixture = setup();
    let mut plan = plan_for(fixture);
    plan.limit_num = 0;
    fill(fixture, plan, SLICE);
}

#[test]
fn test_plan_hash_is_deterministic_and_salt_scopes_budget() {
    let fixture = setup();
    let plan = plan_for(fixture);
    let mut other = plan;
    other.salt = 'salt-2';

    let d = dispatcher(fixture);
    assert_eq!(d.compute_plan_hash(plan), d.compute_plan_hash(plan));
    assert!(d.compute_plan_hash(plan) != d.compute_plan_hash(other));

    fill(fixture, plan, SLICE);
    // A different salt is a different order with its own budget and pacing.
    assert_eq!(d.get_plan_state(d.compute_plan_hash(other)), Default::default());
    fill(fixture, other, SLICE);
    assert_eq!(d.get_plan_state(d.compute_plan_hash(other)).filled, SLICE);
    assert_eq!(d.get_plan_state(d.compute_plan_hash(plan)).filled, SLICE);
}

#[test]
fn test_required_out_scales_with_limit_price() {
    let fixture = setup();
    let mut plan = plan_for(fixture);
    plan.limit_num = 3;
    plan.limit_den = 2;
    assert_eq!(dispatcher(fixture).required_out(plan, 1000), 1500);
    assert_eq!(dispatcher(fixture).required_out(plan, 0), 0);
}

#[test]
fn test_get_privacy_pool() {
    let fixture = setup();
    assert_eq!(dispatcher(fixture).get_privacy_pool(), POOL);
}

#[test]
fn test_unknown_plan_state_is_zero() {
    let fixture = setup();
    let plan: OrderPlan = plan_for(fixture);
    let d = dispatcher(fixture);
    assert_eq!(d.get_plan_state(d.compute_plan_hash(plan)), Default::default());
    assert_eq!(d.remaining(plan), plan.total_amount);
}
