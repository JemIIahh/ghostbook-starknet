//! Mock Ekubo router implementing `IRouter::swap` + `IClear` for tests.
//!
//! Output is priced by a configurable rate (`out = in * rate_num / rate_den`) and stays on the
//! router until cleared, mirroring real Ekubo. Input consumption is configurable too, so partial
//! fills (input left on the router) can be exercised.

#[starknet::interface]
pub trait IMockRouterControl<T> {
    /// `out = in * rate_num / rate_den`.
    fn set_rate(ref self: T, rate_num: u128, rate_den: u128);
    /// Fraction of the input consumed by a swap: `consumed = in * num / den`.
    fn set_consumption(ref self: T, num: u128, den: u128);
    /// When true, `clear_minimum` pays out without enforcing its minimum, so the anonymizer's own
    /// limit-price assertion is what rejects the fill.
    fn set_ignore_minimum(ref self: T, ignore: bool);
}

#[starknet::contract]
pub mod MockRouter {
    use core::num::traits::Zero;
    use ekubo::components::clear::IClear;
    use ekubo::interfaces::erc20::{IERC20Dispatcher, IERC20DispatcherTrait};
    use ekubo::interfaces::router::{RouteNode, TokenAmount};
    use ekubo::types::delta::Delta;
    use ekubo::types::i129::i129;
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};
    use starknet::{ContractAddress, get_caller_address, get_contract_address};
    use super::IMockRouterControl;

    const DEAD_ADDRESS: ContractAddress = 'DEAD_ADDRESS'.try_into().unwrap();

    #[starknet::interface]
    pub trait IMockRouterSwap<T> {
        fn swap(ref self: T, node: RouteNode, token_amount: TokenAmount) -> Delta;
    }

    #[storage]
    struct Storage {
        rate_num: u128,
        rate_den: u128,
        consume_num: u128,
        consume_den: u128,
        ignore_minimum: bool,
        pending_out_token: ContractAddress,
        pending_out_amount: u128,
    }

    #[constructor]
    fn constructor(ref self: ContractState) {
        // Default: 1:1 price, full consumption.
        self.rate_num.write(1);
        self.rate_den.write(1);
        self.consume_num.write(1);
        self.consume_den.write(1);
    }

    #[abi(embed_v0)]
    pub impl MockRouterControlImpl of IMockRouterControl<ContractState> {
        fn set_rate(ref self: ContractState, rate_num: u128, rate_den: u128) {
            assert(rate_den.is_non_zero(), 'ZERO_DEN');
            self.rate_num.write(rate_num);
            self.rate_den.write(rate_den);
        }

        fn set_consumption(ref self: ContractState, num: u128, den: u128) {
            assert(den.is_non_zero(), 'ZERO_DEN');
            self.consume_num.write(num);
            self.consume_den.write(den);
        }

        fn set_ignore_minimum(ref self: ContractState, ignore: bool) {
            self.ignore_minimum.write(ignore);
        }
    }

    #[abi(embed_v0)]
    pub impl MockRouterSwapImpl of IMockRouterSwap<ContractState> {
        fn swap(ref self: ContractState, node: RouteNode, token_amount: TokenAmount) -> Delta {
            let in_token = token_amount.token;
            let amount_in = token_amount.amount.mag;

            let consumed = amount_in * self.consume_num.read() / self.consume_den.read();
            if consumed.is_non_zero() {
                IERC20Dispatcher { contract_address: in_token }
                    .transfer(recipient: DEAD_ADDRESS, amount: consumed.into());
            }

            let out_token = if in_token == node.pool_key.token0 {
                node.pool_key.token1
            } else {
                node.pool_key.token0
            };
            self.pending_out_token.write(out_token);
            self.pending_out_amount.write(consumed * self.rate_num.read() / self.rate_den.read());

            let pos = i129 { mag: amount_in, sign: false };
            let neg = i129 { mag: amount_in, sign: true };
            if in_token == node.pool_key.token0 {
                Delta { amount0: pos, amount1: neg }
            } else {
                Delta { amount0: neg, amount1: pos }
            }
        }
    }

    #[abi(embed_v0)]
    pub impl MockClearImpl of IClear<ContractState> {
        fn clear(self: @ContractState, token: IERC20Dispatcher) -> u256 {
            clear_to(self, token, 0, get_caller_address())
        }

        fn clear_minimum(self: @ContractState, token: IERC20Dispatcher, minimum: u256) -> u256 {
            clear_to(self, token, minimum, get_caller_address())
        }

        fn clear_minimum_to_recipient(
            self: @ContractState,
            token: IERC20Dispatcher,
            minimum: u256,
            recipient: ContractAddress,
        ) -> u256 {
            clear_to(self, token, minimum, recipient)
        }
    }

    /// Pays out the swap output (capped at the amount the last swap produced) or any residual
    /// input balance, enforcing `minimum` unless the mock is told to ignore it.
    fn clear_to(
        self: @ContractState, token: IERC20Dispatcher, minimum: u256, recipient: ContractAddress,
    ) -> u256 {
        let balance = token.balanceOf(account: get_contract_address());
        let amount = if token.contract_address == self.pending_out_token.read() {
            let pending: u256 = self.pending_out_amount.read().into();
            if pending < balance {
                pending
            } else {
                balance
            }
        } else {
            balance
        };
        if !self.ignore_minimum.read() && minimum.is_non_zero() {
            assert(amount >= minimum, 'CLEAR_MINIMUM_NOT_MET');
        }
        if amount.is_non_zero() {
            token.transfer(:recipient, :amount);
        }
        amount
    }
}
