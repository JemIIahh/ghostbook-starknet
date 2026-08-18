/**
 * CipherSign TEE deployment on Flare Testnet Coston2.
 * Source: cipher-sign/docs/SUBMISSION.md
 */

export const CIPHER_SIGN = {
  network: "Flare Testnet Coston2",
  chainId: 114,
  instructionSender: "0x79bB3e509B6a0f43d506a761Fb022221c3FF0Ee9" as const,
  extensionId:
    "0x0000000000000000000000000000000000000000000000000000000000000665" as const,
  explorerUrl:
    "https://coston2-explorer.flare.network/address/0x79bB3e509B6a0f43d506a761Fb022221c3FF0Ee9",
  defaultProxyUrl: "http://127.0.0.1:6674",
} as const;

export const INSTRUCTION_SENDER_ABI = [
  {
    type: "function",
    name: "updateKey",
    stateMutability: "payable",
    inputs: [{ name: "_encryptedKey", type: "bytes" }],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "setPolicy",
    stateMutability: "payable",
    inputs: [{ name: "_policy", type: "bytes" }],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "sign",
    stateMutability: "payable",
    inputs: [{ name: "_message", type: "bytes" }],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "_extensionId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

export const VAULT_SCENARIOS = {
  treasury: {
    label: "Treasury",
    hint: "GhostBook fee vault — allowlisted fee recipient + hard cap.",
    allowlist: [
      "0x1111111111111111111111111111111111111111",
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ] as `0x${string}`[],
    maxAmount: "1000000",
    intentAmount: "500000",
  },
  lp: {
    label: "LP Manager",
    hint: "Liquidity ops — only the LP manager wallet can receive signed payouts.",
    allowlist: ["0x2222222222222222222222222222222222222222"] as `0x${string}`[],
    maxAmount: "5000000",
    intentAmount: "2500000",
  },
  keeper: {
    label: "Keeper",
    hint: "Keeper / rebalance bot — rewards only to the locked payout address.",
    allowlist: ["0x3333333333333333333333333333333333333333"] as `0x${string}`[],
    maxAmount: "250000",
    intentAmount: "100000",
  },
} as const;

export type VaultScenarioId = keyof typeof VAULT_SCENARIOS;
