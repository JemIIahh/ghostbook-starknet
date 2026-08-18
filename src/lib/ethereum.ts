import { ethers } from "ethers";
import { coston2 } from "@/lib/chains";

/** Browser wallet provider — casts past viem/ethers Window.ethereum type clash. */
export function getBrowserProvider(): ethers.BrowserProvider {
  const eth = window.ethereum;
  if (!eth) throw new Error("No wallet found.");
  return new ethers.BrowserProvider(eth as unknown as ethers.Eip1193Provider);
}

/** Read-only Coston2 RPC — use for balances so MetaMask on the wrong chain still shows real funds. */
export function getCoston2RpcProvider(): ethers.JsonRpcProvider {
  const url =
    process.env.NEXT_PUBLIC_RPC_URL ||
    coston2.rpcUrls.default.http[0] ||
    "https://coston2-api.flare.network/ext/C/rpc";
  return new ethers.JsonRpcProvider(url, coston2.id);
}

export const BALANCES_CHANGED_EVENT = "ghostbook:balances-changed";

/** Notify Swap / Admin / etc. to re-fetch token balances (e.g. after faucet). */
export function notifyBalancesChanged(detail?: { address?: string }) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(BALANCES_CHANGED_EVENT, { detail: detail ?? {} })
  );
}
