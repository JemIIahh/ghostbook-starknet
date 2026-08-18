import { Chain } from "viem";

/** Flare Testnet Coston2 — https://dev.flare.network */
export const coston2: Chain = {
  id: 114,
  name: "Flare Testnet Coston2",
  nativeCurrency: {
    decimals: 18,
    name: "Coston2 Flare",
    symbol: "C2FLR",
  },
  rpcUrls: {
    default: {
      http: [
        "https://coston2-api.flare.network/ext/C/rpc",
        "https://falling-skilled-uranium.flare-coston2.quiknode.pro/ext/bc/C/rpc",
      ],
      webSocket: [
        "wss://coston2-api.flare.network/ext/C/ws",
        "wss://falling-skilled-uranium.flare-coston2.quiknode.pro/ext/bc/C/ws",
      ],
    },
    public: {
      http: ["https://coston2-api.flare.network/ext/C/rpc"],
      webSocket: ["wss://coston2-api.flare.network/ext/C/ws"],
    },
  },
  blockExplorers: {
    default: {
      name: "Coston2 Explorer",
      url: "https://coston2-explorer.flare.network",
    },
  },
  testnet: true,
};

/** @deprecated Use `coston2` */
export const polkadotHubTestnet = coston2;

export const allChains: Chain[] = [coston2];
export const mainnetChains: Chain[] = [];
export const testnetChains: Chain[] = [coston2];
export const popularChains: Chain[] = [coston2];

export const getChainById = (chainId: number): Chain | undefined => {
  return chainId === coston2.id ? coston2 : undefined;
};

export const getChainDisplayName = (chain: Chain): string => {
  return chain.name;
};
