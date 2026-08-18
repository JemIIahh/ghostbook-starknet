# GhostBook anonymizer (Cairo)

`GhostBookAnonymizer` is a STRK20 **invoke anonymizer**: the Starknet privacy pool calls it with
`selector!("privacy_invoke")` inside a private transaction, it executes a single-hop swap on
[Ekubo](https://ekubo.org), and returns the output as an `OpenNoteDeposit` the pool credits into
the user's private note.

## What it adds over the reference Ekubo anonymizer

The reference [`EkuboSwapAnonymizer`](https://github.com/starkware-libs/starknet-privacy/tree/main/packages/ekubo_swap_anonymizer)
performs one unconstrained swap per private transaction. GhostBook binds every fill to an
`OrderPlan` the user commits to once:

| Field | Enforced on every fill |
|---|---|
| `limit_num` / `limit_den` | output `>= amount_in * limit_num / limit_den` (limit price) |
| `max_slice` | maximum input per fill |
| `total_amount` | maximum cumulative input across fills |
| `min_interval` | minimum seconds between fills (TWAP / DCA pacing) |
| `expiry` | no fill after this timestamp |
| `salt` | user secret; makes the plan key unlinkable |

State is keyed by `plan_hash = poseidon(serialize(plan))`, so the terms are self-authenticating:
there is no registration step, and changing any field yields a different key instead of mutating a
live order's budget. Only the privacy pool configured in the constructor may call `privacy_invoke`.

The result is a **private limit order / private TWAP** that an untrusted executor can trigger: it
can only ever fill within the terms the user committed to, and every output lands back in the
user's private note.

### Honest privacy scope

The Ekubo leg is a public swap — per-slice amounts and the pool are visible on-chain. What stays
private is the link between the trader and the trade (the pool, not the user, is the swap
counterparty), and the parent order's schedule and limit, which never appear in one revealing
transaction. Slicing further weakens amount correlation.

## Interface

```cairo
fn privacy_invoke(
    plan: OrderPlan,
    router_addr: ContractAddress,
    amount_in: u128,
    skip_ahead: u128,
    note_id: felt252,
) -> Span<OpenNoteDeposit>;

fn get_privacy_pool() -> ContractAddress;
fn compute_plan_hash(plan: OrderPlan) -> felt252;   // mirrored off-chain by the frontend
fn get_plan_state(plan_hash: felt252) -> PlanState; // filled / received / last_fill_at / fills
fn remaining(plan: OrderPlan) -> u128;
fn required_out(plan: OrderPlan, amount_in: u128) -> u256;
```

Fills emit `SliceFilled { plan_hash, note_id, token_in, token_out, amount_in, amount_out,
filled_total, received_total, fills, filled_at }` — enough for the UI to verify a fill from the
receipt, and for an indexer to follow an order without learning who owns it.

### Errors

`NOT_PRIVACY_POOL`, `ZERO_POOL`, `ZERO_ROUTER`, `ZERO_IN_TOKEN`, `ZERO_IN_AMOUNT`, `ZERO_LIMIT`,
`ZERO_TOTAL`, `ZERO_SLICE`, `TOKEN_MISMATCH_POOL_KEY`, `SLICE_TOO_LARGE`, `PLAN_EXHAUSTED`,
`PLAN_EXPIRED`, `INTERVAL_NOT_ELAPSED`, `BALANCE_NOT_SLICE`, `IN_TOKEN_NOT_CLEARED`,
`RECEIVED_AMOUNT_OVERFLOW`, `LIMIT_PRICE_NOT_MET`, `TRANSFER_FAILED`.

## Layout

| Path | Purpose |
|---|---|
| `src/ghostbook_anonymizer.cairo` | the contract, `OrderPlan`, `PlanState`, errors |
| `src/test_contracts/mock_erc20.cairo` | mintable ERC-20 (Ekubo's simplified interface) |
| `src/test_contracts/mock_router.cairo` | mock Ekubo router + `IClear`, configurable rate / consumption |
| `src/tests/` | 18 tests: happy path, access control, caps, pacing, expiry, limit price, partial fills, plan-hash keying |

## Build and test

```bash
scarb fmt
scarb build
snforge test
```

## Declare and deploy

The constructor takes the privacy pool address. STRK20 pool on Starknet mainnet:
`0x52107fadffab71bdcbb6b2ccb68ba3e1b5558d94036538053e159d3076ad633`.

```bash
scarb --profile release build
sncast --account <ACCOUNT> declare --contract-name GhostBookAnonymizer --network mainnet
sncast --account <ACCOUNT> deploy --class-hash <CLASS_HASH> \
  --constructor-calldata 0x52107fadffab71bdcbb6b2ccb68ba3e1b5558d94036538053e159d3076ad633 \
  --network mainnet
```

## Calling it from a wallet

The frontend submits one private transaction whose actions withdraw a slice to the anonymizer,
open a note for the output, and invoke the anonymizer. `"OPEN"`, `"${poolAddress}"` and
`"${openNoteIds[0]}"` are literal placeholder strings substituted by the wallet — never hex-encode
them:

```ts
const actions: WALLET_API.STRK20_ACTION[] = [
  { type: "withdraw", token: tokenIn, amount: num.toHex(slice), recipient: anonymizer },
  { type: "transfer", token: tokenOut, amount: "OPEN", recipient: account },
  { type: "invoke", contract: anonymizer, calldata: [...planCalldata, router, num.toHex(slice), "0x0", "${openNoteIds[0]}"] },
];
await walletAccount.strk20InvokeTransaction(actions);
```

## References

- [Privacy pool contract](https://github.com/starkware-libs/starknet-privacy/tree/main/packages/privacy)
- [STRK20 by Example](https://strk20-by-example.org/)
