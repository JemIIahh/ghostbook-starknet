export const NETWORKS = {
  mainnet: {
    name: "Flare Testnet Coston2",
    rpcUrl:
      process.env.NEXT_PUBLIC_RPC_URL ||
      "https://coston2-api.flare.network/ext/C/rpc",
    explorerUrl: "https://coston2-explorer.flare.network",
    chainId: 114,
    faucetUrl: "https://faucet.flare.network/coston2",
    tokens: {
      C2FLR: {
        symbol: "C2FLR",
        name: "Coston2 Flare",
        decimals: 18,
        erc20: "0x0000000000000000000000000000000000000000",
      },
      USDT0: {
        symbol: "USDT0",
        name: "Tether USD0",
        decimals: 6,
        erc20: "0xC1A5B41512496B80903D1f32d6dEa3a73212E71F",
      },
      FXRP: {
        symbol: "FXRP",
        name: "Flare XRP",
        decimals: 6,
        erc20: "0x0b6A3645c240605887a5532109323A3E12273dc7",
      },
    },
  },
} as const;

export type TokenSymbol = "C2FLR" | "USDT0" | "FXRP";
export type TokenConfig = (typeof NETWORKS.mainnet.tokens)[TokenSymbol];

export const getNetwork = () => NETWORKS.mainnet;
export const getToken = (symbol: TokenSymbol) => NETWORKS.mainnet.tokens[symbol];
export const getExplorerTxUrl = (hash: string) =>
  `${NETWORKS.mainnet.explorerUrl}/tx/${hash}`;
export const getExplorerContractUrl = (addr: string) =>
  `${NETWORKS.mainnet.explorerUrl}/address/${addr}`;
