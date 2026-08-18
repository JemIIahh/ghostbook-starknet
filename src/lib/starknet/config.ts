/**
 * Network configuration for GhostBook on Starknet.
 *
 * Values are the ones verified against the live network in the sprint's Day 0 guide — not the
 * Sepolia defaults from the STRK20 starter kit.
 */

import { RpcProvider, constants } from "starknet";

export type NetworkKey = "mainnet" | "sepolia";

export type NetworkConfig = {
  key: NetworkKey;
  label: string;
  chainId: constants.StarknetChainId;
  rpcUrl: string;
  explorerBase: string;
  /** STRK20 privacy pool. */
  privacyPool: string;
  /** Ekubo router exposing `swap` + `IClear` (`clear`, `clear_minimum`). */
  ekuboRouter: string;
  /** GhostBook anonymizer; empty until deployed on that network. */
  anonymizer: string;
};

export const MAINNET: NetworkConfig = {
  key: "mainnet",
  label: "Mainnet",
  chainId: constants.StarknetChainId.SN_MAIN,
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL_MAINNET || "https://rpc.starknet.lava.build",
  explorerBase: "https://voyager.online",
  privacyPool: "0x040337b1af3c663e86e333bab5a4b28da8d4652a15a69beee2b677776ffe812a",
  ekuboRouter: "0x0199741822c2dc722f6f605204f35e56dbc23bceed54818168c4c49e4fb8737e",
  anonymizer: process.env.NEXT_PUBLIC_ANONYMIZER_MAINNET || "",
};

export const SEPOLIA: NetworkConfig = {
  key: "sepolia",
  label: "Sepolia",
  chainId: constants.StarknetChainId.SN_SEPOLIA,
  rpcUrl:
    process.env.NEXT_PUBLIC_RPC_URL_SEPOLIA || "https://starknet-sepolia.public.blastapi.io/rpc/v0_8",
  explorerBase: "https://sepolia.voyager.online",
  // The pool exists on Sepolia too; set these when testing there.
  privacyPool: process.env.NEXT_PUBLIC_PRIVACY_POOL_SEPOLIA || "",
  ekuboRouter: process.env.NEXT_PUBLIC_EKUBO_ROUTER_SEPOLIA || "",
  anonymizer: process.env.NEXT_PUBLIC_ANONYMIZER_SEPOLIA || "",
};

export const NETWORKS: Record<NetworkKey, NetworkConfig> = {
  mainnet: MAINNET,
  sepolia: SEPOLIA,
};

export const DEFAULT_NETWORK: NetworkKey = "mainnet";

export function networkForChainId(chainId: string | undefined): NetworkConfig | null {
  if (!chainId) return null;
  if (chainId === constants.StarknetChainId.SN_MAIN) return MAINNET;
  if (chainId === constants.StarknetChainId.SN_SEPOLIA) return SEPOLIA;
  return null;
}

const providerCache = new Map<NetworkKey, RpcProvider>();

/** Read-only provider for the given network, tracking the UI's selected network. */
export function providerFor(network: NetworkConfig): RpcProvider {
  const cached = providerCache.get(network.key);
  if (cached) return cached;
  const provider = new RpcProvider({ nodeUrl: network.rpcUrl });
  providerCache.set(network.key, provider);
  return provider;
}

export type TokenInfo = {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
};

/**
 * Tokens GhostBook trades. Addresses are the canonical mainnet deployments; Ekubo has deep
 * STRK/USDC and ETH/USDC liquidity, which is what the order plans route through.
 */
export const TOKENS: TokenInfo[] = [
  {
    symbol: "STRK",
    name: "Starknet Token",
    address: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
    decimals: 18,
  },
  {
    symbol: "ETH",
    name: "Ether",
    address: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
    decimals: 18,
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    address: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
    decimals: 6,
  },
];

export function tokenByAddress(address: string): TokenInfo | undefined {
  let target: bigint;
  try {
    target = BigInt(address);
  } catch {
    return undefined;
  }
  return TOKENS.find((t) => BigInt(t.address) === target);
}

export function tokenBySymbol(symbol: string): TokenInfo | undefined {
  return TOKENS.find((t) => t.symbol === symbol);
}

export function explorerTxUrl(network: NetworkConfig, txHash: string): string {
  return `${network.explorerBase}/tx/${txHash}`;
}

export function explorerContractUrl(network: NetworkConfig, address: string): string {
  return `${network.explorerBase}/contract/${address}`;
}
