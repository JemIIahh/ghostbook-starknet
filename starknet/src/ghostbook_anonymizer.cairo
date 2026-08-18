//! GhostBook conditional-order anonymizer for Ekubo.
//!
//! An invoke anonymizer (called by the STRK20 privacy pool via `selector!("privacy_invoke")`)
//! that executes a *slice* of a user-committed order plan as a single-hop Ekubo swap and
//! returns the output for deposit into an open note.
//!
//! Where the reference `EkuboSwapAnonymizer` performs one unconstrained swap per private
//! transaction, this contract binds every fill to an `OrderPlan` — a limit price, a per-slice
//! cap, a minimum interval between slices, a total budget and an expiry — identified by
//! `plan_hash = poseidon(serialize(plan))`. The plan carries a user-chosen `salt`, so the hash
//! is unlinkable to the user's public identity while remaining stable across the fills of one
//! order. State is keyed by the hash of the exact terms, so a plan's terms can never be mutated
//! mid-flight: changing any field yields a different key, and the original budget is untouched.
//!
//! This makes private limit orders and private TWAP/DCA schedules enforceable on-chain by an
//! untrusted executor: whoever assembles the private transaction can only ever fill within the
//! terms the user committed to, and every output lands back in the user's private note.
//!
//! Trust notes (honest scope):
//! - Only the configured privacy pool may call `privacy_invoke`, so plan state cannot be
//!   polluted by direct calls.
//! - The swap itself is a public Ekubo swap: slice amounts and the pool are visible on-chain.
//!   What stays private is the link between the trader and the trade, and the schedule/limit of
//!   the parent order, which never appears in a single revealing transaction.

use ekubo::types::keys::PoolKey;
use privacy::objects::OpenNoteDeposit;
use starknet::ContractAddress;

/// Errors raised by [`GhostBookAnonymizer`].
pub mod errors {
    pub const NOT_PRIVACY_POOL: felt252 = 'NOT_PRIVACY_POOL';
    pub const ZERO_POOL: felt252 = 'ZERO_POOL';
    pub const ZERO_ROUTER: felt252 = 'ZERO_ROUTER';
    pub const ZERO_IN_TOKEN: felt252 = 'ZERO_IN_TOKEN';
    pub const ZERO_IN_AMOUNT: felt252 = 'ZERO_IN_AMOUNT';
    pub const ZERO_LIMIT: felt252 = 'ZERO_LIMIT';
    pub const ZERO_TOTAL: felt252 = 'ZERO_TOTAL';
    pub const ZERO_SLICE: felt252 = 'ZERO_SLICE';
    pub const TOKEN_MISMATCH_POOL_KEY: felt252 = 'TOKEN_MISMATCH_POOL_KEY';
    pub const SLICE_TOO_LARGE: felt252 = 'SLICE_TOO_LARGE';
    pub const PLAN_EXHAUSTED: felt252 = 'PLAN_EXHAUSTED';
    pub const PLAN_EXPIRED: felt252 = 'PLAN_EXPIRED';
    pub const INTERVAL_NOT_ELAPSED: felt252 = 'INTERVAL_NOT_ELAPSED';
    pub const BALANCE_NOT_SLICE: felt252 = 'BALANCE_NOT_SLICE';
    pub const IN_TOKEN_NOT_CLEARED: felt252 = 'IN_TOKEN_NOT_CLEARED';
    pub const RECEIVED_AMOUNT_OVERFLOW: felt252 = 'RECEIVED_AMOUNT_OVERFLOW';
    pub const LIMIT_PRICE_NOT_MET: felt252 = 'LIMIT_PRICE_NOT_MET';
    pub const TRANSFER_FAILED: felt252 = 'TRANSFER_FAILED';
}

/// The terms a user commits to for one order. Re-supplied on every fill and hashed to derive the
/// plan's storage key, so the terms are self-authenticating: no registration step, and no way to
/// spend one plan's budget under different terms.
#[derive(Copy, Drop, Serde, PartialEq)]
pub struct OrderPlan {
    /// User-chosen secret. Makes `plan_hash` unlinkable and prevents third parties from
    /// pre-computing (and griefing) a plan key.
    pub salt: felt252,
    /// Token being sold.
    pub token_in: ContractAddress,
    /// Ekubo pool to trade against. The bought token is the other token of the pair.
    pub pool_key: PoolKey,
    /// Maximum cumulative input across all fills of this plan.
    pub total_amount: u128,
    /// Maximum input per fill. Equal to `total_amount` for a plain limit order; smaller for a
    /// TWAP/DCA schedule.
    pub max_slice: u128,
    /// Minimum seconds between two fills of this plan. Zero for a plain limit order.
    pub min_interval: u64,
    /// Unix timestamp after which no fill is allowed.
    pub expiry: u64,
    /// Limit price numerator: a fill must return at least `amount_in * limit_num / limit_den`
    /// of the bought token.
    pub limit_num: u256,
    /// Limit price denominator.
    pub limit_den: u256,
}

/// Per-plan accounting kept by the anonymizer.
#[derive(Copy, Drop, Serde, PartialEq, Debug, Default, starknet::Store)]
pub struct PlanState {
    /// Cumulative input filled so far.
    pub filled: u128,
    /// Cumulative output received so far.
    pub received: u128,
    /// Timestamp of the last fill.
    pub last_fill_at: u64,
    /// Number of fills executed.
    pub fills: u32,
}

#[starknet::interface]
pub trait IGhostBookAnonymizer<T> {
    /// Executes one slice of `plan` on Ekubo and returns the output for deposit into `note_id`.
    ///
    /// Called by the privacy pool via `selector!("privacy_invoke")`. The pool has already
    /// transferred exactly `amount_in` of `plan.token_in` to this contract (withdraw precedes
    /// invoke), and pulls the output back via the allowance set here.
    ///
    /// #### Enforced on every fill
    /// - caller is the configured privacy pool,
    /// - `amount_in <= plan.max_slice` and `filled + amount_in <= plan.total_amount`,
    /// - `block_timestamp <= plan.expiry`,
    /// - `block_timestamp >= last_fill_at + plan.min_interval` (after the first fill),
    /// - output `>= amount_in * plan.limit_num / plan.limit_den` (limit price),
    /// - full fill only: no input tokens may remain on the router.
    fn privacy_invoke(
        ref self: T,
        plan: OrderPlan,
        router_addr: ContractAddress,
        amount_in: u128,
        skip_ahead: u128,
        note_id: felt252,
    ) -> Span<OpenNoteDeposit>;

    /// The privacy pool allowed to drive fills.
    fn get_privacy_pool(self: @T) -> ContractAddress;
    /// Storage key of `plan`: `poseidon(serialize(plan))`. Mirrored off-chain by the frontend.
    fn compute_plan_hash(self: @T, plan: OrderPlan) -> felt252;
    /// Accounting for `plan_hash` (zeroed for an unknown plan).
    fn get_plan_state(self: @T, plan_hash: felt252) -> PlanState;
    /// Input still fillable under `plan`.
    fn remaining(self: @T, plan: OrderPlan) -> u128;
    /// Minimum output a fill of `amount_in` must produce under `plan`.
    fn required_out(self: @T, plan: OrderPlan, amount_in: u128) -> u256;
}

#[starknet::contract]
pub mod GhostBookAnonymizer {
    use core::num::traits::Zero;
    use core::poseidon::poseidon_hash_span;
    use ekubo::components::clear::{IClearDispatcher, IClearDispatcherTrait};
    use ekubo::interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use ekubo::interfaces::router::{
        IRouterDispatcher, IRouterDispatcherTrait, RouteNode, TokenAmount,
    };
    use ekubo::types::i129::i129;
    use ekubo::types::keys::PoolKey;
    use privacy::objects::OpenNoteDeposit;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_block_timestamp, get_caller_address, get_contract_address};
    use super::{IGhostBookAnonymizer, OrderPlan, PlanState, errors};

    #[storage]
    struct Storage {
        privacy_pool: ContractAddress,
        plans: Map<felt252, PlanState>,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    pub enum Event {
        SliceFilled: SliceFilled,
    }

    /// Emitted for every fill. `plan_hash` is salted, so indexers can follow an order's progress
    /// without learning who owns it.
    #[derive(Drop, starknet::Event)]
    pub struct SliceFilled {
        #[key]
        pub plan_hash: felt252,
        #[key]
        pub note_id: felt252,
        pub token_in: ContractAddress,
        pub token_out: ContractAddress,
        pub amount_in: u128,
        pub amount_out: u128,
        pub filled_total: u128,
        pub received_total: u128,
        pub fills: u32,
        pub filled_at: u64,
    }

    #[constructor]
    fn constructor(ref self: ContractState, privacy_pool: ContractAddress) {
        assert(privacy_pool.is_non_zero(), errors::ZERO_POOL);
        self.privacy_pool.write(privacy_pool);
    }

    #[abi(embed_v0)]
    pub impl GhostBookAnonymizerImpl of IGhostBookAnonymizer<ContractState> {
        fn privacy_invoke(
            ref self: ContractState,
            plan: OrderPlan,
            router_addr: ContractAddress,
            amount_in: u128,
            skip_ahead: u128,
            note_id: felt252,
        ) -> Span<OpenNoteDeposit> {
            let privacy_pool = self.privacy_pool.read();
            assert(get_caller_address() == privacy_pool, errors::NOT_PRIVACY_POOL);
            assert(router_addr.is_non_zero(), errors::ZERO_ROUTER);

            let token_out = validate_plan(plan);
            assert(amount_in.is_non_zero(), errors::ZERO_IN_AMOUNT);
            assert(amount_in <= plan.max_slice, errors::SLICE_TOO_LARGE);

            let now = get_block_timestamp();
            assert(now <= plan.expiry, errors::PLAN_EXPIRED);

            let plan_hash = plan_hash(plan);
            let state = self.plans.entry(plan_hash).read();
            assert(state.filled + amount_in <= plan.total_amount, errors::PLAN_EXHAUSTED);
            if state.fills != 0 {
                assert(now >= state.last_fill_at + plan.min_interval, errors::INTERVAL_NOT_ELAPSED);
            }

            let min_out = min_out_for(plan, amount_in);
            let self_addr = get_contract_address();
            let in_erc20 = IERC20Dispatcher { contract_address: plan.token_in };
            let out_erc20 = IERC20Dispatcher { contract_address: token_out };

            // The pool withdraws exactly one slice to this contract before invoking. Requiring an
            // exact balance keeps dust from being stranded here.
            assert(
                in_erc20.balanceOf(account: self_addr) == amount_in.into(),
                errors::BALANCE_NOT_SLICE,
            );

            let token_amount = TokenAmount {
                token: plan.token_in, amount: i129 { mag: amount_in, sign: false },
            };
            assert(
                in_erc20.transfer(recipient: router_addr, amount: amount_in.into()),
                errors::TRANSFER_FAILED,
            );

            let router = IRouterDispatcher { contract_address: router_addr };
            // `sqrt_ratio_limit: 0` — full fill or revert; partial fills are rejected below.
            router
                .swap(
                    node: RouteNode { pool_key: plan.pool_key, sqrt_ratio_limit: 0, skip_ahead },
                    :token_amount,
                );

            let clear = IClearDispatcher { contract_address: router_addr };
            let in_remaining = clear
                .clear(token: IERC20Dispatcher { contract_address: plan.token_in });
            assert(in_remaining.is_zero(), errors::IN_TOKEN_NOT_CLEARED);

            let balance_before = out_erc20.balanceOf(account: self_addr);
            clear
                .clear_minimum(
                    token: IERC20Dispatcher { contract_address: token_out }, minimum: min_out,
                );
            let balance_after = out_erc20.balanceOf(account: self_addr);
            let amount_out: u128 = (balance_after - balance_before)
                .try_into()
                .expect(errors::RECEIVED_AMOUNT_OVERFLOW);
            // `clear_minimum` guards the router's payout; this guards the actual credit to us.
            assert(amount_out.into() >= min_out, errors::LIMIT_PRICE_NOT_MET);

            let new_state = PlanState {
                filled: state.filled + amount_in,
                received: state.received + amount_out,
                last_fill_at: now,
                fills: state.fills + 1,
            };
            self.plans.entry(plan_hash).write(new_state);

            // The pool pulls the output into the open note via `transfer_from`.
            assert(
                out_erc20.approve(spender: privacy_pool, amount: amount_out.into()),
                errors::TRANSFER_FAILED,
            );

            self
                .emit(
                    SliceFilled {
                        plan_hash,
                        note_id,
                        token_in: plan.token_in,
                        token_out,
                        amount_in,
                        amount_out,
                        filled_total: new_state.filled,
                        received_total: new_state.received,
                        fills: new_state.fills,
                        filled_at: now,
                    },
                );

            [OpenNoteDeposit { note_id, token: token_out, amount: amount_out }].span()
        }

        fn get_privacy_pool(self: @ContractState) -> ContractAddress {
            self.privacy_pool.read()
        }

        fn compute_plan_hash(self: @ContractState, plan: OrderPlan) -> felt252 {
            plan_hash(plan)
        }

        fn get_plan_state(self: @ContractState, plan_hash: felt252) -> PlanState {
            self.plans.entry(plan_hash).read()
        }

        fn remaining(self: @ContractState, plan: OrderPlan) -> u128 {
            let filled = self.plans.entry(plan_hash(plan)).read().filled;
            if filled >= plan.total_amount {
                0
            } else {
                plan.total_amount - filled
            }
        }

        fn required_out(self: @ContractState, plan: OrderPlan, amount_in: u128) -> u256 {
            min_out_for(plan, amount_in)
        }
    }

    /// Checks the plan is internally consistent and returns the bought token.
    fn validate_plan(plan: OrderPlan) -> ContractAddress {
        assert(plan.token_in.is_non_zero(), errors::ZERO_IN_TOKEN);
        assert(plan.total_amount.is_non_zero(), errors::ZERO_TOTAL);
        assert(plan.max_slice.is_non_zero(), errors::ZERO_SLICE);
        assert(plan.limit_num.is_non_zero() && plan.limit_den.is_non_zero(), errors::ZERO_LIMIT);
        let PoolKey { token0, token1, .. } = plan.pool_key;
        if plan.token_in == token0 {
            token1
        } else {
            assert(plan.token_in == token1, errors::TOKEN_MISMATCH_POOL_KEY);
            token0
        }
    }

    /// `poseidon(serialize(plan))` — the plan's storage key.
    fn plan_hash(plan: OrderPlan) -> felt252 {
        let mut serialized: Array<felt252> = array![];
        Serde::serialize(@plan, ref serialized);
        poseidon_hash_span(serialized.span())
    }

    /// Limit price applied to a slice: `amount_in * limit_num / limit_den`.
    fn min_out_for(plan: OrderPlan, amount_in: u128) -> u256 {
        (amount_in.into() * plan.limit_num) / plan.limit_den
    }
}
