/**
 * Reads and writes against the deployed `GhostBookAnonymizer`.
 *
 * Plan progress lives on-chain keyed by the salted plan hash, so the UI reads it back without
 * needing an indexer, and fill receipts are verified from the contract's own `SliceFilled` event.
 */

import { hash, num, type RpcProvider } from "starknet";
import type { OrderPlan } from "@/lib/strk20/plan";
import { planCalldata, planHash } from "@/lib/strk20/plan";

export type PlanState = {
  filled: bigint;
  received: bigint;
  lastFillAt: number;
  fills: number;
};

export const EMPTY_PLAN_STATE: PlanState = {
  filled: 0n,
  received: 0n,
  lastFillAt: 0,
  fills: 0,
};

async function call(
  provider: RpcProvider,
  contractAddress: string,
  entrypoint: string,
  calldata: string[],
): Promise<bigint[]> {
  const raw = await provider.callContract({ contractAddress, entrypoint, calldata }, "latest");
  const values = Array.isArray(raw) ? raw : (raw as { result: string[] }).result;
  return values.map((v) => BigInt(v));
}

/** `get_plan_state(plan_hash)` — zeroed for a plan that has never filled. */
export async function readPlanState(
  provider: RpcProvider,
  anonymizer: string,
  plan: OrderPlan,
): Promise<PlanState> {
  const [filled, received, lastFillAt, fills] = await call(
    provider,
    anonymizer,
    "get_plan_state",
    [planHash(plan)],
  );
  return {
    filled: filled ?? 0n,
    received: received ?? 0n,
    lastFillAt: Number(lastFillAt ?? 0n),
    fills: Number(fills ?? 0n),
  };
}

/** `get_privacy_pool()` — used to verify the deployment is bound to the pool we're talking to. */
export async function readPrivacyPool(
  provider: RpcProvider,
  anonymizer: string,
): Promise<string> {
  const [pool] = await call(provider, anonymizer, "get_privacy_pool", []);
  return num.toHex(pool);
}

/** `compute_plan_hash(plan)` — cross-check of the frontend's own poseidon mirror. */
export async function readPlanHash(
  provider: RpcProvider,
  anonymizer: string,
  plan: OrderPlan,
): Promise<string> {
  const [value] = await call(provider, anonymizer, "compute_plan_hash", planCalldata(plan));
  return num.toHex(value);
}

export type PlanProgress = {
  state: PlanState;
  remaining: bigint;
  nextFillAt: number;
  expired: boolean;
  exhausted: boolean;
};

export function planProgress(plan: OrderPlan, state: PlanState, nowSeconds: number): PlanProgress {
  const remaining = state.filled >= plan.totalAmount ? 0n : plan.totalAmount - state.filled;
  const nextFillAt = state.fills === 0 ? 0 : state.lastFillAt + Number(plan.minInterval);
  return {
    state,
    remaining,
    nextFillAt,
    expired: nowSeconds > Number(plan.expiry),
    exhausted: remaining === 0n,
  };
}

export type SliceFilledEvent = {
  planHash: string;
  noteId: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  amountOut: bigint;
  filledTotal: bigint;
  receivedTotal: bigint;
  fills: number;
  filledAt: number;
};

type ReceiptLike = {
  events?: Array<{ from_address?: string; keys?: string[]; data?: string[] }>;
  value?: { events?: Array<{ from_address?: string; keys?: string[]; data?: string[] }> };
};

/**
 * Pulls the anonymizer's `SliceFilled` event out of a transaction receipt.
 *
 * This is the proof a private transaction actually filled a slice: the pool's own events don't say
 * anything about our order terms, and the swap is executed by the pool on our behalf.
 *
 * Event layout: keys = [selector, plan_hash, note_id], data = [token_in, token_out, amount_in,
 * amount_out, filled_total, received_total, fills, filled_at].
 */
export function parseSliceFilled(
  receipt: unknown,
  anonymizer: string,
): SliceFilledEvent | null {
  const r = receipt as ReceiptLike;
  const events = r?.events ?? r?.value?.events ?? [];
  const selector = num.toHex(hash.getSelectorFromName("SliceFilled"));
  let target: bigint;
  try {
    target = BigInt(anonymizer);
  } catch {
    return null;
  }

  for (const event of events) {
    if (!event?.keys?.length || !event.from_address || !event.data) continue;
    try {
      if (BigInt(event.from_address) !== target) continue;
      if (num.toHex(event.keys[0]) !== selector) continue;
      const [, planHashKey, noteId] = event.keys;
      const [tokenIn, tokenOut, amountIn, amountOut, filledTotal, receivedTotal, fills, filledAt] =
        event.data;
      return {
        planHash: num.toHex(planHashKey),
        noteId: num.toHex(noteId),
        tokenIn: num.toHex(tokenIn),
        tokenOut: num.toHex(tokenOut),
        amountIn: BigInt(amountIn),
        amountOut: BigInt(amountOut),
        filledTotal: BigInt(filledTotal),
        receivedTotal: BigInt(receivedTotal),
        fills: Number(BigInt(fills)),
        filledAt: Number(BigInt(filledAt)),
      };
    } catch {
      continue;
    }
  }
  return null;
}
