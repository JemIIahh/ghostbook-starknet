/**
 * Shared TEE trade pipeline for Swap + Orders.
 * Encrypt → escrow on PrivacyRouter → TEE match → attested settle.
 */

import { ethers } from "ethers";
import { getBrowserProvider } from "@/lib/ethereum";
import { UNISWAP_CONFIG } from "@/lib/uniswapConfig";
import { ERC20_ABI } from "@/lib/uniswapAbis";
import { encryptIntentToPubkey, PRIVACY_ROUTER_ABI, type SealedSwapIntent } from "@/lib/privacy";

export type TeeInfo = {
  configured: boolean;
  address?: string;
  publicKey?: string;
  privacyRouter?: string | null;
  error?: string;
};

export type TeeTradeParams = {
  tokenIn: string;
  tokenOut: string;
  amountInHuman: string;
  /** Absolute min out in tokenOut human units (limit). If omitted, uses quote − slippage. */
  amountOutMinHuman?: string;
  slippagePct?: string;
  fee?: number;
  recipient: string;
  /** market = escrow+match+settle; limit = escrow only (settle later) */
  mode: "market" | "limit";
  onStep?: (step: string) => void;
};

export type TeeTradeResult = {
  intentId: string;
  escrowTxHash: string;
  settleTxHash?: string;
  quotedOut?: string;
  status: "matched" | "active";
};

export function getPrivacyRouterAddress(teeInfo?: TeeInfo | null): string {
  return (
    teeInfo?.privacyRouter ||
    process.env.NEXT_PUBLIC_PRIVACY_ROUTER ||
    UNISWAP_CONFIG.privacyRouter ||
    ""
  );
}

export async function fetchTeeInfo(): Promise<TeeInfo> {
  const res = await fetch("/api/privacy/info");
  const j = (await res.json()) as TeeInfo;
  if (!res.ok) return { configured: false, error: j.error };
  return j;
}

async function tokenDecimals(token: string): Promise<number> {
  const provider = getBrowserProvider();
  const c = new ethers.Contract(token, ERC20_ABI, provider);
  return Number(await c.decimals());
}

export async function executeTeeTrade(params: TeeTradeParams): Promise<TeeTradeResult> {
  const tee = await fetchTeeInfo();
  if (!tee.configured || !tee.publicKey) {
    throw new Error(
      tee.error || "Privacy TEE offline — set PRIVACY_TEE_PRIVATE_KEY in .env.local"
    );
  }
  const routerAddress = getPrivacyRouterAddress(tee);
  if (!routerAddress) {
    throw new Error("PrivacyRouter not configured (NEXT_PUBLIC_PRIVACY_ROUTER).");
  }

  const fee = params.fee ?? 3000;
  const provider = getBrowserProvider();
  const signer = await provider.getSigner();
  const dIn = await tokenDecimals(params.tokenIn);
  const dOut = await tokenDecimals(params.tokenOut);
  const amountParsed = ethers.parseUnits(params.amountInHuman, dIn);

  let minOut = 0n;
  if (params.amountOutMinHuman != null && params.amountOutMinHuman !== "") {
    minOut = ethers.parseUnits(params.amountOutMinHuman, dOut);
  } else if (params.mode === "market") {
    // Best-effort client quote for slippage floor (TEE re-quotes server-side)
    try {
      const { QUOTER_ABI } = await import("@/lib/uniswapAbis");
      const quoter = new ethers.Contract(
        UNISWAP_CONFIG.quoterAddress,
        QUOTER_ABI,
        provider
      );
      const result = await quoter.quoteSingle.staticCall({
        tokenIn: params.tokenIn,
        tokenOut: params.tokenOut,
        fee,
        amountIn: amountParsed,
        sqrtPriceLimitX96: 0n,
      });
      const quoted = BigInt(result[0] ?? result);
      const bps = BigInt(Math.floor(Number(params.slippagePct || "0.5") * 100));
      minOut = quoted - (quoted * bps) / 10_000n;
    } catch {
      minOut = 0n;
    }
  }

  const deadline = Math.floor(Date.now() / 1000) + (params.mode === "limit" ? 86400 : 3600);
  const sealed: SealedSwapIntent = {
    version: 1,
    tokenIn: params.tokenIn as `0x${string}`,
    tokenOut: params.tokenOut as `0x${string}`,
    amountIn: amountParsed.toString(),
    amountOutMin: minOut.toString(),
    fee,
    recipient: params.recipient as `0x${string}`,
    deadline,
    salt: ethers.hexlify(ethers.randomBytes(16)),
  };

  params.onStep?.("encrypt");
  const { commitment, packed } = await encryptIntentToPubkey(sealed, tee.publicKey);

  const erc20 = new ethers.Contract(params.tokenIn, ERC20_ABI, signer);
  const router = new ethers.Contract(routerAddress, PRIVACY_ROUTER_ABI, signer);

  params.onStep?.("approve");
  const allowance: bigint = await erc20.allowance(params.recipient, routerAddress);
  if (allowance < amountParsed) {
    const txA = await erc20.approve(routerAddress, ethers.MaxUint256);
    await txA.wait();
  }

  params.onStep?.("escrow");
  const txSub = await router.submitIntent(
    params.tokenIn,
    amountParsed,
    commitment,
    packed,
    deadline
  );
  const receipt = await txSub.wait();
  const escrowTxHash = receipt.hash as string;

  let intentId: string | null = null;
  for (const log of receipt.logs as ethers.Log[]) {
    try {
      const parsed = router.interface.parseLog({
        topics: log.topics as string[],
        data: log.data,
      });
      if (parsed?.name === "IntentSubmitted") {
        intentId = parsed.args.id.toString();
        break;
      }
    } catch {
      /* skip */
    }
  }
  if (!intentId) {
    const next = await router.nextIntentId();
    intentId = (BigInt(next) - 1n).toString();
  }

  if (params.mode === "limit") {
    return {
      intentId,
      escrowTxHash,
      status: "active",
    };
  }

  params.onStep?.("match");
  const matchRes = await fetch("/api/privacy/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intentId }),
  });
  const matchJson = (await matchRes.json()) as {
    error?: string;
    teeSig?: string;
    tokenOut?: string;
    amountOutMin?: string;
    fee?: number;
    recipient?: string;
    quotedOut?: string;
  };
  if (!matchRes.ok || !matchJson.teeSig) {
    throw new Error(matchJson.error || "TEE match failed");
  }

  params.onStep?.("settle");
  const txSettle = await router.settle(
    intentId,
    matchJson.tokenOut,
    matchJson.amountOutMin,
    matchJson.fee,
    matchJson.recipient,
    matchJson.teeSig
  );
  const settleReceipt = await txSettle.wait();

  return {
    intentId,
    escrowTxHash,
    settleTxHash: settleReceipt.hash as string,
    quotedOut: matchJson.quotedOut,
    status: "matched",
  };
}

/** Fill an open TEE limit intent (match + settle). */
export async function settleTeeIntent(intentId: string): Promise<{
  settleTxHash: string;
  quotedOut?: string;
}> {
  const tee = await fetchTeeInfo();
  const routerAddress = getPrivacyRouterAddress(tee);
  if (!routerAddress) throw new Error("PrivacyRouter not configured.");

  const matchRes = await fetch("/api/privacy/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intentId }),
  });
  const matchJson = (await matchRes.json()) as {
    error?: string;
    teeSig?: string;
    tokenOut?: string;
    amountOutMin?: string;
    fee?: number;
    recipient?: string;
    quotedOut?: string;
  };
  if (!matchRes.ok || !matchJson.teeSig) {
    throw new Error(matchJson.error || "TEE match failed — limit may be unmet");
  }

  const provider = getBrowserProvider();
  const signer = await provider.getSigner();
  const router = new ethers.Contract(routerAddress, PRIVACY_ROUTER_ABI, signer);
  const txSettle = await router.settle(
    intentId,
    matchJson.tokenOut,
    matchJson.amountOutMin,
    matchJson.fee,
    matchJson.recipient,
    matchJson.teeSig
  );
  const settleReceipt = await txSettle.wait();
  return {
    settleTxHash: settleReceipt.hash as string,
    quotedOut: matchJson.quotedOut,
  };
}

export async function cancelTeeIntent(intentId: string): Promise<string> {
  const tee = await fetchTeeInfo();
  const routerAddress = getPrivacyRouterAddress(tee);
  if (!routerAddress) throw new Error("PrivacyRouter not configured.");
  const provider = getBrowserProvider();
  const signer = await provider.getSigner();
  const router = new ethers.Contract(routerAddress, PRIVACY_ROUTER_ABI, signer);
  const tx = await router.cancel(intentId);
  const receipt = await tx.wait();
  return receipt.hash as string;
}
