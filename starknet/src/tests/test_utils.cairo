//! Shared fixtures for the GhostBook anonymizer tests.

use core::num::traits::Zero;
use ekubo::interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
use ekubo::types::keys::PoolKey;
use ghostbook_anonymizer::ghostbook_anonymizer::{
    IGhostBookAnonymizerDispatcher, IGhostBookAnonymizerDispatcherTrait, OrderPlan,
};
use ghostbook_anonymizer::test_contracts::mock_erc20::{
    IMockERC20MintDispatcher, IMockERC20MintDispatcherTrait,
};
use ghostbook_anonymizer::test_contracts::mock_router::{
    IMockRouterControlDispatcher, IMockRouterControlDispatcherTrait,
};
use snforge_std::{
    CheatSpan, ContractClassTrait, DeclareResultTrait, cheat_caller_address, declare,
    start_cheat_block_timestamp_global,
};
use starknet::ContractAddress;

pub const POOL: ContractAddress = 'PRIVACY_POOL'.try_into().unwrap();
pub const STRANGER: ContractAddress = 'STRANGER'.try_into().unwrap();
pub const NOTE_ID: felt252 = 'note-1';
pub const SLICE: u128 = 1000;
pub const START_TS: u64 = 1_000_000;

#[derive(Copy, Drop)]
pub struct Fixture {
    pub anonymizer: ContractAddress,
    pub router: ContractAddress,
    pub token_in: ContractAddress,
    pub token_out: ContractAddress,
}

pub fn deploy_token() -> ContractAddress {
    let class = declare("MockERC20").unwrap().contract_class();
    let (address, _) = class.deploy(@array![]).unwrap();
    address
}

pub fn deploy_router() -> ContractAddress {
    let class = declare("MockRouter").unwrap().contract_class();
    let (address, _) = class.deploy(@array![]).unwrap();
    address
}

pub fn deploy_anonymizer(privacy_pool: ContractAddress) -> ContractAddress {
    let class = declare("GhostBookAnonymizer").unwrap().contract_class();
    let (address, _) = class.deploy(@array![privacy_pool.into()]).unwrap();
    address
}

/// Deploys two tokens, a mock router and the anonymizer, funds the router with output liquidity
/// and pins the block timestamp to [`START_TS`].
pub fn setup() -> Fixture {
    let token_a = deploy_token();
    let token_b = deploy_token();
    let router = deploy_router();
    let anonymizer = deploy_anonymizer(POOL);
    mint(token_b, router, 1_000_000_000);
    start_cheat_block_timestamp_global(START_TS);
    Fixture { anonymizer, router, token_in: token_a, token_out: token_b }
}

pub fn mint(token: ContractAddress, recipient: ContractAddress, amount: u128) {
    let amount_u256: u256 = amount.into();
    IMockERC20MintDispatcher { contract_address: token }.mint(recipient, amount_u256);
}

pub fn balance_of(token: ContractAddress, account: ContractAddress) -> u128 {
    IERC20Dispatcher { contract_address: token }.balanceOf(account).try_into().unwrap()
}

pub fn allowance(token: ContractAddress, owner: ContractAddress, spender: ContractAddress) -> u128 {
    IERC20Dispatcher { contract_address: token }.allowance(owner, spender).try_into().unwrap()
}

pub fn pool_key(token_a: ContractAddress, token_b: ContractAddress) -> PoolKey {
    let (token0, token1) = if token_a < token_b {
        (token_a, token_b)
    } else {
        (token_b, token_a)
    };
    PoolKey { token0, token1, fee: 0, tick_spacing: 1, extension: Zero::zero() }
}

/// A plan selling `token_in` at a 1:1 limit price, in `SLICE`-sized slices.
pub fn plan_for(fixture: Fixture) -> OrderPlan {
    OrderPlan {
        salt: 'salt-1',
        token_in: fixture.token_in,
        pool_key: pool_key(fixture.token_in, fixture.token_out),
        total_amount: SLICE * 3,
        max_slice: SLICE,
        min_interval: 60,
        expiry: START_TS + 86_400,
        limit_num: 1,
        limit_den: 1,
    }
}

pub fn set_rate(fixture: Fixture, num: u128, den: u128) {
    IMockRouterControlDispatcher { contract_address: fixture.router }.set_rate(num, den);
}

pub fn set_consumption(fixture: Fixture, num: u128, den: u128) {
    IMockRouterControlDispatcher { contract_address: fixture.router }.set_consumption(num, den);
}

pub fn set_ignore_minimum(fixture: Fixture, ignore: bool) {
    IMockRouterControlDispatcher { contract_address: fixture.router }.set_ignore_minimum(ignore);
}

pub fn dispatcher(fixture: Fixture) -> IGhostBookAnonymizerDispatcher {
    IGhostBookAnonymizerDispatcher { contract_address: fixture.anonymizer }
}

/// Funds the anonymizer with one slice (as the pool's withdraw would) and calls `privacy_invoke`
/// as the pool.
pub fn fill(
    fixture: Fixture, plan: OrderPlan, amount_in: u128,
) -> Span<privacy::objects::OpenNoteDeposit> {
    mint(plan.token_in, fixture.anonymizer, amount_in);
    fill_without_funding(fixture, plan, amount_in)
}

pub fn fill_without_funding(
    fixture: Fixture, plan: OrderPlan, amount_in: u128,
) -> Span<privacy::objects::OpenNoteDeposit> {
    cheat_caller_address(fixture.anonymizer, POOL, CheatSpan::TargetCalls(1));
    dispatcher(fixture).privacy_invoke(plan, fixture.router, amount_in, 0, NOTE_ID)
}
