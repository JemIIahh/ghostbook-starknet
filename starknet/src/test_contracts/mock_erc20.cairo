//! Minimal mintable ERC20 (Ekubo's simplified interface) for tests.

#[starknet::interface]
pub trait IMockERC20Mint<T> {
    fn mint(ref self: T, recipient: starknet::ContractAddress, amount: u256);
}

#[starknet::contract]
pub mod MockERC20 {
    use core::num::traits::Zero;
    use ekubo::interfaces::erc20::IERC20;
    use starknet::storage::{
        Map, StoragePathEntry, StoragePointerReadAccess, StoragePointerWriteAccess,
    };
    use starknet::{ContractAddress, get_caller_address};

    #[storage]
    struct Storage {
        balances: Map<ContractAddress, u256>,
        allowances: Map<(ContractAddress, ContractAddress), u256>,
    }

    #[abi(embed_v0)]
    pub impl MockERC20Impl of IERC20<ContractState> {
        fn transfer(ref self: ContractState, recipient: ContractAddress, amount: u256) -> bool {
            let sender = get_caller_address();
            let balance = self.balances.entry(sender).read();
            assert(balance >= amount, 'INSUFFICIENT_BALANCE');
            self.balances.entry(sender).write(balance - amount);
            self.balances.entry(recipient).write(self.balances.entry(recipient).read() + amount);
            true
        }

        fn balanceOf(self: @ContractState, account: ContractAddress) -> u256 {
            self.balances.entry(account).read()
        }

        fn approve(ref self: ContractState, spender: ContractAddress, amount: u256) -> bool {
            self.allowances.entry((get_caller_address(), spender)).write(amount);
            true
        }

        fn transferFrom(
            ref self: ContractState,
            sender: ContractAddress,
            recipient: ContractAddress,
            amount: u256,
        ) -> bool {
            let spender = get_caller_address();
            let allowance = self.allowances.entry((sender, spender)).read();
            assert(allowance >= amount, 'INSUFFICIENT_ALLOWANCE');
            let balance = self.balances.entry(sender).read();
            assert(balance >= amount, 'INSUFFICIENT_BALANCE');
            self.allowances.entry((sender, spender)).write(allowance - amount);
            self.balances.entry(sender).write(balance - amount);
            self.balances.entry(recipient).write(self.balances.entry(recipient).read() + amount);
            true
        }

        fn allowance(
            self: @ContractState, owner: ContractAddress, spender: ContractAddress,
        ) -> u256 {
            self.allowances.entry((owner, spender)).read()
        }
    }

    #[abi(embed_v0)]
    pub impl MockERC20MintImpl of super::IMockERC20Mint<ContractState> {
        fn mint(ref self: ContractState, recipient: ContractAddress, amount: u256) {
            assert(recipient.is_non_zero(), 'ZERO_RECIPIENT');
            self.balances.entry(recipient).write(self.balances.entry(recipient).read() + amount);
        }
    }
}
