/**
 * Uniswap V3 + token addresses on Flare Testnet Coston2 (chainId 114).
 */
export const UNISWAP_CONFIG = {
  // Custom MockTokens (mintable via Admin — owner = deployer)
  ghost: "0x1daBC80337bF2d85d496c4eD9cE63a1b16Fbd539", // GHOST
  book: "0x284E2F5585eAb8860b6b541e561a4F3aC98DCC08", // BOOK
  spark: "0xcf2dfCa5804a0f32D8bB233dF0898B8238b40658", // SPARK
  // Legacy aliases
  pumpaz: "0x1daBC80337bF2d85d496c4eD9cE63a1b16Fbd539",
  nia: "0x284E2F5585eAb8860b6b541e561a4F3aC98DCC08",
  wDot: "0xcf2dfCa5804a0f32D8bB233dF0898B8238b40658",
  // Coston2 faucet / system tokens (not mintable from Admin)
  usdt: "0xC1A5B41512496B80903D1f32d6dEa3a73212E71F", // USDT0
  usdc: "0x0000000000000000000000000000000000000000",
  fxrp: "0x0b6A3645c240605887a5532109323A3E12273dc7", // FXRP
  wNat: "0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273",
  // Uniswap V3 stack
  factoryAddress: "0x5E6658ac6cBC9b0109C28BED00bC4Af0F0A3f1CD",
  managerAddress: "0x90Dfd581393104EAe03Fd349b4867A7E8F51313b",
  testutils: "0x27603a61d2eCD51940558EC4eD3bd182C13485E7",
  quoterAddress: "0x68BB922f1c1466108206D873c370617697Cd4271",
  /** Optional on-chain GhostFaucet (after deploy). Empty = use /api/faucet. */
  faucetAddress: "" as string,
  /**
   * PrivacyRouter — sealed escrow + TEE-attested settlement.
   * Deploy: `npx hardhat run scripts/deployPrivacyRouter.ts --network coston2`
   * TEE signer must match PRIVACY_TEE_PRIVATE_KEY / FAUCET_PRIVATE_KEY.
   */
  privacyRouter: "0x0c885d338123149493E16cFAd53969bC06B49722" as string,
  pools: [] as { [key: string]: string }[],
};

export type UniswapToken = {
  key: string;
  symbol: string;
  address: string;
  /** MockToken with Admin mint — false for faucet tokens */
  mintable: boolean;
};

/** All tradeable tokens in the UI (swap, liquidity, pools, orders). */
export const UNISWAP_TOKENS: UniswapToken[] = [
  { key: "ghost", symbol: "GHOST", address: UNISWAP_CONFIG.ghost, mintable: true },
  { key: "book", symbol: "BOOK", address: UNISWAP_CONFIG.book, mintable: true },
  { key: "spark", symbol: "SPARK", address: UNISWAP_CONFIG.spark, mintable: true },
  { key: "usdt0", symbol: "USDT0", address: UNISWAP_CONFIG.usdt, mintable: false },
  { key: "fxrp", symbol: "FXRP", address: UNISWAP_CONFIG.fxrp, mintable: false },
];

/** Tokens that Admin can mint (MockToken only). */
export const MINTABLE_TOKENS = UNISWAP_TOKENS.filter((t) => t.mintable);
