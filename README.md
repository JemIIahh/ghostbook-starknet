# GhostBook

> **TEE-first** confidential DEX on **Flare Testnet Coston2** — sealed swaps & orders via PrivacyRouter, CipherSign vault for policy-gated signing, Uniswap V3 settlement.

![Flare](https://img.shields.io/badge/Flare-Coston2-pink)
![ChainID](https://img.shields.io/badge/chainId-114-blue)
![TEE](https://img.shields.io/badge/TEE-PrivacyRouter%20%2B%20CipherSign-30d158)
![Next.js](https://img.shields.io/badge/Next.js-16-black)
![License](https://img.shields.io/badge/license-MIT-green)

## What it is

GhostBook is a concentrated-liquidity DEX on Coston2 with **trading and signing gated by Trusted Execution Environments**:

1. **Swap & Orders** — encrypt intent (ECIES) → escrow on **PrivacyRouter** → TEE match/attest → settle through Uniswap V3  
2. **Vault** — **CipherSign** on Flare Confidential Compute (allowlist / cap / expiry before any payout signature)  
3. **Pools / Liquidity / Admin** — public Uniswap V3 ops (create pools, LP, mint demo tokens)

Trade mintable demo tokens (**GHOST**, **BOOK**, **SPARK**) and Coston2 faucet tokens (**USDT0**, **FXRP**).

### Privacy model (honest)

| Sealed until fill | Visible on-chain |
|-------------------|------------------|
| `tokenOut`, minOut, salt, limit price | Escrow size (`amountIn`) |
| Matching / quote inside TEE | Settlement swap amounts at fill (Uniswap) |

## Features

| Page | What you get |
|------|----------------|
| **Swap** | **TEE only** — encrypt → PrivacyRouter escrow → `/api/privacy/match` → attested `settle` |
| **Orders** | **TEE only** — market (escrow+match+settle) · limit (escrow; **TEE fill** or cancel) |
| **Vault** | CipherSign TEE policy lock + intent sign (Live FCC or Preview) |
| **Pools** | Discover pairs; Manage opens Liquidity with pair + fee prefilled |
| **Liquidity** | Add / remove concentrated LP with tick range |
| **Admin** | Create pools, mint mocks, balances; navbar **Faucet** for all users |

## TEE trade pipeline

```text
Wallet
  │  1. Encrypt swap/order intent with TEE pubkey (ECIES)
  ▼
PrivacyRouter
  │  2. submitIntent — escrow tokenIn + commitment + ciphertext
  ▼
TEE (/api/privacy/match)
  │  3. Decrypt · quote Uniswap · sign settlement digest
  ▼
PrivacyRouter.settle
  │  4. Verify TEE ECDSA → swapSingle → pay recipient
```

Shared client: `src/lib/privacy/trade.ts` (used by Swap + Orders).

## Tech Stack

| Layer | Technology |
|-------|------------|
| **Network** | Flare Testnet Coston2 (chainId `114`), gas = **C2FLR** |
| **DEX** | Solidity Uniswap V3 (Hardhat) |
| **Privacy** | PrivacyRouter + server TEE attestor (`PRIVACY_TEE_PRIVATE_KEY`) |
| **Ops TEE** | CipherSign FCC stack in `cipher-sign/` |
| **Frontend** | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| **Wallet** | wagmi + Reown AppKit (MetaMask / WalletConnect) |

## Deployed contracts (Coston2)

Explorer: [coston2-explorer.flare.network](https://coston2-explorer.flare.network)

| Contract | Address | Explorer |
|----------|---------|----------|
| **PrivacyRouter** | `0x0c885d338123149493E16cFAd53969bC06B49722` | [View](https://coston2-explorer.flare.network/address/0x0c885d338123149493E16cFAd53969bC06B49722) |
| Factory | `0x5E6658ac6cBC9b0109C28BED00bC4Af0F0A3f1CD` | [View](https://coston2-explorer.flare.network/address/0x5E6658ac6cBC9b0109C28BED00bC4Af0F0A3f1CD) |
| Manager | `0x90Dfd581393104EAe03Fd349b4867A7E8F51313b` | [View](https://coston2-explorer.flare.network/address/0x90Dfd581393104EAe03Fd349b4867A7E8F51313b) |
| Quoter | `0x68BB922f1c1466108206D873c370617697Cd4271` | [View](https://coston2-explorer.flare.network/address/0x68BB922f1c1466108206D873c370617697Cd4271) |
| TestUtils | `0x27603a61d2eCD51940558EC4eD3bd182C13485E7` | [View](https://coston2-explorer.flare.network/address/0x27603a61d2eCD51940558EC4eD3bd182C13485E7) |
| GHOST | `0x1daBC80337bF2d85d496c4eD9cE63a1b16Fbd539` | [View](https://coston2-explorer.flare.network/address/0x1daBC80337bF2d85d496c4eD9cE63a1b16Fbd539) |
| BOOK | `0x284E2F5585eAb8860b6b541e561a4F3aC98DCC08` | [View](https://coston2-explorer.flare.network/address/0x284E2F5585eAb8860b6b541e561a4F3aC98DCC08) |
| SPARK | `0xcf2dfCa5804a0f32D8bB233dF0898B8238b40658` | [View](https://coston2-explorer.flare.network/address/0xcf2dfCa5804a0f32D8bB233dF0898B8238b40658) |

Synced in `src/lib/uniswapConfig.ts`. TEE signer for PrivacyRouter must match `PRIVACY_TEE_PRIVATE_KEY` / `FAUCET_PRIVATE_KEY` (deployer).

### Tokens

| Token | Address | Mintable | Explorer |
|-------|---------|----------|----------|
| GHOST | `0x1daBC80337bF2d85d496c4eD9cE63a1b16Fbd539` | Yes (owner / faucet API) | [View](https://coston2-explorer.flare.network/address/0x1daBC80337bF2d85d496c4eD9cE63a1b16Fbd539) |
| BOOK | `0x284E2F5585eAb8860b6b541e561a4F3aC98DCC08` | Yes | [View](https://coston2-explorer.flare.network/address/0x284E2F5585eAb8860b6b541e561a4F3aC98DCC08) |
| SPARK | `0xcf2dfCa5804a0f32D8bB233dF0898B8238b40658` | Yes | [View](https://coston2-explorer.flare.network/address/0xcf2dfCa5804a0f32D8bB233dF0898B8238b40658) |
| USDT0 | `0xC1A5B41512496B80903D1f32d6dEa3a73212E71F` | No (Coston2 faucet) | [View](https://coston2-explorer.flare.network/address/0xC1A5B41512496B80903D1f32d6dEa3a73212E71F) |
| FXRP | `0x0b6A3645c240605887a5532109323A3E12273dc7` | No (Coston2 faucet) | [View](https://coston2-explorer.flare.network/address/0x0b6A3645c240605887a5532109323A3E12273dc7) |
| WC2FLR (WNat) | `0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273` | No (system) | [View](https://coston2-explorer.flare.network/address/0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273) |

### CipherSign vault (ops TEE)

| Item | Value |
|------|-------|
| InstructionSender | [`0x79bB3e509B6a0f43d506a761Fb022221c3FF0Ee9`](https://coston2-explorer.flare.network/address/0x79bB3e509B6a0f43d506a761Fb022221c3FF0Ee9) |
| Stack | `cipher-sign/tee` (Docker FCC + ext-proxy) |

Vault gates **operator signatures** (allowlist, max amount, expiry). Trading uses PrivacyRouter, not public `swapSingle` from the UI.

### Redeploy PrivacyRouter

```bash
cd uniswap-implementation
npx hardhat run scripts/deployPrivacyRouter.ts --network coston2
```

Then set `NEXT_PUBLIC_PRIVACY_ROUTER` / `uniswapConfig.privacyRouter` and keep `PRIVACY_TEE_PRIVATE_KEY` = `teeSigner`.

## Quick start

### Prerequisites

- Node.js 18+ and [pnpm](https://pnpm.io)
- MetaMask on **Flare Testnet Coston2** (chainId `114`)
- C2FLR for gas — [Coston2 Faucet](https://faucet.flare.network/coston2)

### Run the app

```bash
pnpm install
cp .env.example .env.local
# Set FAUCET_PRIVATE_KEY (token owner) — also used as Privacy TEE attestor
# NEXT_PUBLIC_PRIVACY_ROUTER is already set for the deployed router
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Suggested demo flow

1. Connect wallet on Coston2  
2. **Faucet** (navbar) or **Admin** → get GHOST / BOOK / SPARK  
3. **Admin** → create pool (e.g. GHOST + BOOK, fee `0.30%`, price like `100`)  
4. **Liquidity** → Use Mock Params → Approve → Add Liquidity  
5. **Swap** — TEE private swap  
6. **Orders** — TEE market settle, or limit escrow + **TEE fill**  
7. **Vault** — lock CipherSign policy and request a signature (Preview or Live)

### Environment variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SITE_URL` | Canonical URL for OG / sitemap (production) |
| `NEXT_PUBLIC_RPC_URL` | Coston2 RPC |
| `NEXT_PUBLIC_CHAIN_ID` | `114` |
| `NEXT_PUBLIC_PROJECT_ID` | Optional Reown / WalletConnect project id |
| `NEXT_PUBLIC_PRIVACY_ROUTER` | PrivacyRouter address |
| `PRIVACY_TEE_PRIVATE_KEY` | TEE attestor (defaults to `FAUCET_PRIVATE_KEY`) — must match router `teeSigner` |
| `FAUCET_PRIVATE_KEY` | MockToken owner for `/api/faucet` + Admin mint |
| `NEXT_PUBLIC_FCC_DIRECT_URL` | Usually `/fcc` (Next rewrite) for CipherSign Live |
| `NEXT_PUBLIC_FCC_DIRECT_API_KEY` | Same as tee `DIRECT_API_KEY` |
| `FCC_PROXY_URL` | `http://127.0.0.1:6674` or tunnel URL |

### Live CipherSign TEE (Vault)

```bash
cd cipher-sign/tee
cp .env.example .env   # PRIVATE_KEY, DIRECT_API_KEY, LOCAL_MODE=false, SIMULATED_TEE=true
./scripts/full-setup.sh
```

Then in `.env.local`:

```bash
NEXT_PUBLIC_FCC_DIRECT_URL=/fcc
NEXT_PUBLIC_FCC_DIRECT_API_KEY=<same DIRECT_API_KEY>
FCC_PROXY_URL=http://127.0.0.1:6674
```

Restart `pnpm dev`. Vault **Preview** works without Docker; Live needs the FCC proxy. Runbook: `cipher-sign/docs/SETUP.md`.

### Redeploy Uniswap (Hardhat)

```bash
cd uniswap-implementation
npx hardhat run scripts/deployUniswapV3Factory.ts --network coston2
npx hardhat run scripts/deployUniswapV3Manager.ts --network coston2
npx hardhat run scripts/deployUniswapV3Quoter.ts --network coston2
npx hardhat run scripts/testUtilsDeployment.ts --network coston2
npx hardhat run scripts/deployMockTokens.ts --network coston2
npx hardhat run scripts/deployPrivacyRouter.ts --network coston2
```

Copy addresses into `src/lib/uniswapConfig.ts`.

## Project structure

```
ghostbook/
├── cipher-sign/                 # FCC / CipherSign TEE (Vault)
├── uniswap-implementation/      # Hardhat Uniswap V3 + PrivacyRouter
├── public/                      # Brand assets
├── src/
│   ├── app/
│   │   ├── privacy/             # TEE Swap UI
│   │   ├── orders/              # TEE market / limit
│   │   ├── vault/               # CipherSign
│   │   ├── pools/ · liquidity/ · admin/
│   │   └── api/
│   │       ├── faucet/          # GHOST/BOOK/SPARK drip
│   │       └── privacy/         # TEE info + match/attest
│   ├── components/
│   ├── context/
│   └── lib/
│       ├── privacy/             # ECIES encrypt, trade client, ABIs
│       ├── cipherSign/          # FCC /direct client
│       └── uniswapConfig.ts
└── .env.example
```

## Notes

- Default fee tier in the UI is **0.30%** (`3000`). Pool fee must match.  
- Public Uniswap swap UI is removed; `/swap` redirects to TEE Swap (`/privacy`).  
- Display amounts are formatted to **2 decimal places**.  
- Build uses webpack (`pnpm run build`) to avoid Turbopack icon-collision panics.

---

*Built for Flare Testnet Coston2 · TEE-sealed trading + CipherSign vault.*
