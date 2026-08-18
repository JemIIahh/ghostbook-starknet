# GhostBook

> **Private limit orders & TWAPs on Starknet** — an STRK20 invoke anonymizer that fills user-committed order plans on Ekubo and returns the output straight into a private note.

![Starknet](https://img.shields.io/badge/Starknet-SN__MAIN-orange)
![Cairo](https://img.shields.io/badge/Cairo-Scarb%20%2B%20snforge-blue)
![DEX](https://img.shields.io/badge/DEX-Ekubo-8a63d2)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![License](https://img.shields.io/badge/license-MIT-green)

## What it is

GhostBook turns the [Starknet privacy pool](https://github.com/starkware-libs/starknet-privacy/tree/main/packages/privacy)
(STRK20) into a **private order book**. Instead of one unconstrained swap per private transaction,
the user commits once to an `OrderPlan` — limit price, slice size, total budget, pacing interval,
expiry — and every fill is checked against those terms on-chain.

1. **Plan** — the frontend builds an `OrderPlan` and mirrors `plan_hash = poseidon(serialize(plan))` off-chain
2. **Fill** — a private transaction withdraws a slice to `GhostBookAnonymizer`, which swaps one hop on
   [Ekubo](https://ekubo.org) and returns the output as an `OpenNoteDeposit`
3. **Repeat** — an untrusted executor can trigger further slices, but only within the committed plan

The result is a private limit order / private TWAP: the pool (not the user) is the swap
counterparty, and the order's schedule and limit never appear in a single revealing transaction.

### Privacy model (honest)

| Stays private | Public on-chain |
|---|---|
| Who is trading — the pool is the swap counterparty, and fills are relayed | Each slice's Ekubo swap: pool key, amounts, timing |
| Note-to-note transfers: no amount, no parties | Shielding: your address, the token, the amount |
| Which deposit a withdrawal came from | Withdrawal destination and amount |
| The plan itself — terms are never published, only `poseidon(plan)` | Each fill's `SliceFilled` event, keyed by the salted plan hash |

**GhostBook claims identity privacy, not amount privacy.** Slicing weakens amount correlation but
does not hide the swap: a distinctive amount executed shortly after a distinctive deposit is still
correlatable. Plan terms are not published, but an observer watching one plan hash can bound the
limit price and pacing from the fills themselves.

## Enforced plan terms

| Field | Enforced on every fill |
|---|---|
| `limit_num` / `limit_den` | output `>= amount_in * limit_num / limit_den` |
| `max_slice` | maximum input per fill |
| `total_amount` | maximum cumulative input across fills |
| `min_interval` | minimum seconds between fills (TWAP / DCA pacing) |
| `expiry` | no fill after this timestamp |
| `salt` | user secret; keeps the plan key unlinkable |

State is keyed by `plan_hash`, so terms are self-authenticating: there is no registration step, and
changing any field yields a different key instead of mutating a live order's budget. Only the
privacy pool set in the constructor may call `privacy_invoke`.

## Tech stack

| Layer | Technology |
|---|---|
| **Network** | Starknet mainnet (`SN_MAIN`), Sepolia for testing |
| **Contract** | Cairo (`starknet/`), Scarb + Starknet Foundry (`snforge`) |
| **DEX** | Ekubo router (`swap` + `IClear`) |
| **Privacy** | STRK20 privacy pool + `strk20InvokeTransaction` wallet API |
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| **Wallet** | `starknet.js` 10 + `@starknet-io/get-starknet` (wallet standard) |

## Mainnet addresses

| | |
|---|---|
| STRK20 privacy pool | `0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a` |
| Ekubo router (`swap` + `IClear`) | `0x0199741822c2dc722f6f605204f35e56dbc23bceed54818168c4c49e4fb8737e` |
| Ekubo Core (pool discovery) | `0x00000005dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b` |
| RPC | `https://rpc.starknet.lava.build` |
| Explorer | [voyager.online](https://voyager.online) |

Traded tokens: **STRK**, **ETH**, **USDC** (addresses verified on mainnet by `symbol`/`decimals`
calls). Pool keys are resolved at runtime by quoting the router, because liquidity per fee tier
varies and some pools use non-zero extensions the probe grid can't enumerate — at the time of
writing, `STRK/ETH` and `ETH/USDC` price on the 100bps / 19802 tier, and `STRK/USDC` has no
zero-extension pool in the probed grid. All values live in `src/lib/starknet/config.ts`; the deployed
anonymizer address comes from `NEXT_PUBLIC_ANONYMIZER_MAINNET`.

## Quick start

### Prerequisites

- Node.js 18+ and [pnpm](https://pnpm.io)
- A Starknet wallet implementing the STRK20 wallet API (Ready supports it today), on **Mainnet**
- STRK for gas, and a registered viewing key on the pool — every pool user registers once, and
  deposits are screened on-chain by a compliance provider
- [Scarb](https://docs.swmansion.com/scarb/) + [Starknet Foundry](https://foundry-rs.github.io/starknet-foundry/) for the contract

### Run the app

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Contract

```bash
cd starknet
scarb fmt
scarb build
snforge test        # 19 tests: access control, caps, pacing, expiry, limit price, partial fills, plan-hash mirror
```

Declare and deploy (constructor takes the privacy pool address):

```bash
scarb --profile release build
sncast --account <ACCOUNT> declare --contract-name GhostBookAnonymizer --network mainnet
sncast --account <ACCOUNT> deploy --class-hash <CLASS_HASH> \
  --constructor-calldata 0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a \
  --network mainnet
```

### Pool / quote helpers

Ekubo pool keys are `(token0, token1, fee, tick_spacing, extension)` and cannot be guessed:

```bash
node scripts/find-pools.mjs STRK USDC   # probe fee/tick-spacing grid for real liquidity
node scripts/quote.mjs STRK ETH 1       # quote the exact router the anonymizer calls
```

### Environment variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical URL for OG / sitemap (production) |
| `NEXT_PUBLIC_RPC_URL_MAINNET` | Starknet mainnet RPC (default: Lava) |
| `NEXT_PUBLIC_RPC_URL_SEPOLIA` | Starknet Sepolia RPC |
| `NEXT_PUBLIC_ANONYMIZER_MAINNET` | Deployed `GhostBookAnonymizer` (mainnet) |
| `NEXT_PUBLIC_ANONYMIZER_SEPOLIA` | Deployed `GhostBookAnonymizer` (Sepolia) |
| `NEXT_PUBLIC_PRIVACY_POOL_SEPOLIA` | Privacy pool address when testing on Sepolia |
| `NEXT_PUBLIC_EKUBO_ROUTER_SEPOLIA` | Ekubo router address when testing on Sepolia |

## Calling the anonymizer

One private transaction: withdraw a slice to the anonymizer, open a note for the output, invoke.
`"OPEN"`, `"${poolAddress}"` and `"${openNoteIds[0]}"` are literal placeholders substituted by the
wallet — never hex-encode them:

```ts
const actions: WALLET_API.STRK20_ACTION[] = [
  { type: "withdraw", token: tokenIn, amount: num.toHex(slice), recipient: anonymizer },
  { type: "transfer", token: tokenOut, amount: "OPEN", recipient: account },
  { type: "invoke", contract: anonymizer, calldata: [...planCalldata, router, num.toHex(slice), "0x0", "${openNoteIds[0]}"] },
];
await walletAccount.strk20InvokeTransaction(actions);
```

## Project structure

```
ghostbook/
├── starknet/                    # Cairo contract (Scarb + snforge)
│   ├── src/ghostbook_anonymizer.cairo
│   ├── src/test_contracts/      # mock ERC-20, mock Ekubo router
│   └── src/tests/
├── scripts/                     # find-pools.mjs, quote.mjs (Ekubo probes)
├── public/                      # Brand assets
└── src/
    ├── app/                     # Next.js routes: landing, /private, /orders
    ├── components/
    ├── context/
    └── lib/
        ├── starknet/config.ts   # networks, addresses, tokens, provider
        └── strk20/plan.ts       # OrderPlan mirror, poseidon plan hash, pool keys
```

## Status

The Cairo anonymizer (19 passing tests) and the Starknet client layer are complete, and the UI is
ported: `/private` covers shield, private transfer, unshield and shielded balances; `/orders` covers
the plan builder, live Ekubo quotes and per-slice fills with on-chain progress. The frontend's
`planHash()` is pinned against the contract by `test_plan_hash_matches_frontend`, so the two can't
silently diverge.

Not done yet: mainnet declare/deploy of the anonymizer, the three mainnet transactions and demo
video recorded in `strk20.json`, and a hosted demo.

GhostBook began as a TEE-based confidential DEX on Flare Coston2 (Uniswap V3 fork + `PrivacyRouter`).
That stack has been removed: on Starknet the privacy is protocol-level via STRK20 rather than
bolted on at the app layer, and settlement uses Ekubo's existing liquidity instead of a bespoke AMM.

## References

- [Privacy pool contract](https://github.com/starkware-libs/starknet-privacy/tree/main/packages/privacy)
- [Reference `EkuboSwapAnonymizer`](https://github.com/starkware-libs/starknet-privacy/tree/main/packages/ekubo_swap_anonymizer)
- [STRK20 by Example](https://strk20-by-example.org/)
- [Ekubo](https://ekubo.org)

---

*Private limit orders and TWAPs on Starknet — committed plans, public settlement, unlinkable traders.*
