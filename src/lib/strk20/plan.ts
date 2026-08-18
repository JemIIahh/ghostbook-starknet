/**
 * GhostBook order plans — the TypeScript mirror of `OrderPlan` in
 * `starknet/src/ghostbook_anonymizer.cairo`.
 *
 * A plan is committed once and re-supplied on every fill: the anonymizer keys its accounting by
 * `poseidon(serialize(plan))`, so the terms authenticate themselves and the salt keeps the key
 * unlinkable. Serialization order here must match the Cairo struct exactly — 15 felts:
 *
 *   salt, token_in, pool_key(5), total_amount, max_slice, min_interval, expiry,
 *   limit_num(2: low/high), limit_den(2: low/high)
 */

import { hash, num } from "starknet";

export type PoolKey = {
  token0: string;
  token1: string;
  /** Ekubo fee as a 0.128 fixed-point fraction (1% = 2**128 / 100). */
  fee: bigint;
  tickSpacing: bigint;
  extension: string;
};

export type OrderPlan = {
  /** User secret; makes the plan hash unlinkable and prevents third parties from guessing it. */
  salt: string;
  tokenIn: string;
  poolKey: PoolKey;
  /** Maximum cumulative input, in the token's smallest unit. */
  totalAmount: bigint;
  /** Maximum input per fill. Equal to totalAmount for a plain limit order. */
  maxSlice: bigint;
  /** Minimum seconds between fills. Zero for a plain limit order. */
  minInterval: bigint;
  /** Unix seconds after which no fill is allowed. */
  expiry: bigint;
  /** A fill must return at least `amountIn * limitNum / limitDen` of the bought token. */
  limitNum: bigint;
  limitDen: bigint;
};

export const TWO_128 = 1n << 128n;

/** Ekubo fee from basis points: 30bps -> 0.3% of 2**128. */
export function feeFromBps(bps: number): bigint {
  return (TWO_128 * BigInt(Math.round(bps * 100))) / 1_000_000n;
}

export function bpsFromFee(fee: bigint): number {
  return Number((fee * 1_000_000n) / TWO_128) / 100;
}

/** Sorts a pair the way Ekubo pool keys require (token0 < token1 by integer value). */
export function sortedPair(a: string, b: string): [string, string] {
  return BigInt(a) < BigInt(b) ? [a, b] : [b, a];
}

export function makePoolKey(
  tokenA: string,
  tokenB: string,
  fee: bigint,
  tickSpacing: bigint,
  extension = "0x0",
): PoolKey {
  const [token0, token1] = sortedPair(tokenA, tokenB);
  return { token0, token1, fee, tickSpacing, extension };
}

/** The bought token: the side of the pool that isn't `tokenIn`. */
export function tokenOutOf(plan: OrderPlan): string {
  return BigInt(plan.tokenIn) === BigInt(plan.poolKey.token0)
    ? plan.poolKey.token1
    : plan.poolKey.token0;
}

function u256Felts(value: bigint): string[] {
  const mask = (1n << 128n) - 1n;
  return [num.toHex(value & mask), num.toHex(value >> 128n)];
}

/** Cairo `Serde` encoding of the plan: the poseidon preimage and the head of the invoke calldata. */
export function planCalldata(plan: OrderPlan): string[] {
  return [
    num.toHex(plan.salt),
    num.toHex(plan.tokenIn),
    num.toHex(plan.poolKey.token0),
    num.toHex(plan.poolKey.token1),
    num.toHex(plan.poolKey.fee),
    num.toHex(plan.poolKey.tickSpacing),
    num.toHex(plan.poolKey.extension),
    num.toHex(plan.totalAmount),
    num.toHex(plan.maxSlice),
    num.toHex(plan.minInterval),
    num.toHex(plan.expiry),
    ...u256Felts(plan.limitNum),
    ...u256Felts(plan.limitDen),
  ];
}

/**
 * `poseidon(serialize(plan))` — must equal `GhostBookAnonymizer.compute_plan_hash(plan)`.
 * Pinned on both sides by `test_plan_hash_matches_frontend` in the Cairo test suite.
 */
export function planHash(plan: OrderPlan): string {
  return hash.computePoseidonHashOnElements(planCalldata(plan));
}

/** Minimum output a fill of `amountIn` must produce, matching the contract's integer division. */
export function requiredOut(plan: OrderPlan, amountIn: bigint): bigint {
  return (amountIn * plan.limitNum) / plan.limitDen;
}

/** A fresh 251-bit salt. Losing it means losing the ability to fill the plan again. */
export function randomSalt(): string {
  const bytes = new Uint8Array(31);
  crypto.getRandomValues(bytes);
  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);
  return num.toHex(value);
}

/**
 * Builds a plan from human inputs.
 *
 * `limitPrice` is quoted in output units per input unit (e.g. 0.00003 ETH per STRK) and converted
 * to the contract's integer ratio using both tokens' decimals.
 */
export function buildPlan(input: {
  salt?: string;
  tokenIn: string;
  tokenOut: string;
  decimalsIn: number;
  decimalsOut: number;
  poolKey: PoolKey;
  /** Total input in whole tokens. */
  totalAmount: number;
  /** Per-fill input in whole tokens. */
  sliceAmount: number;
  /** Minimum minutes between fills. */
  intervalMinutes: number;
  /** Hours until the plan expires. */
  expiryHours: number;
  /** Minimum output per input unit, in whole tokens. */
  limitPrice: number;
  now?: number;
}): OrderPlan {
  // required_out(out units) = amount_in(in units) * price * 10**(decimalsOut - decimalsIn)
  const scale = 1_000_000_000n; // 9 decimal places of limit-price precision
  const priceScaled = BigInt(Math.round(input.limitPrice * Number(scale)));
  const limitNum = priceScaled * 10n ** BigInt(input.decimalsOut);
  const limitDen = 10n ** BigInt(input.decimalsIn) * scale;

  const nowSeconds = BigInt(Math.floor((input.now ?? Date.now()) / 1000));
  return {
    salt: input.salt ?? randomSalt(),
    tokenIn: input.tokenIn,
    poolKey: input.poolKey,
    totalAmount: toSmallestUnit(input.totalAmount, input.decimalsIn),
    maxSlice: toSmallestUnit(input.sliceAmount, input.decimalsIn),
    minInterval: BigInt(Math.max(0, Math.round(input.intervalMinutes * 60))),
    expiry: nowSeconds + BigInt(Math.max(1, Math.round(input.expiryHours * 3600))),
    limitNum,
    limitDen,
  };
}

export function toSmallestUnit(amount: number, decimals: number): bigint {
  const [whole, frac = ""] = String(amount).split(".");
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

export function fromSmallestUnit(amount: bigint, decimals: number): number {
  return Number(amount) / 10 ** decimals;
}

/** The plan's limit price in output units per input unit. */
export function limitPriceOf(plan: OrderPlan, decimalsIn: number, decimalsOut: number): number {
  const perUnit = (Number(plan.limitNum) / Number(plan.limitDen)) * 10 ** (decimalsIn - decimalsOut);
  return perUnit;
}

/** Serializable form for localStorage (bigint isn't JSON-safe). */
export type StoredPlan = {
  hash: string;
  createdAt: number;
  label: string;
  tokenIn: string;
  tokenOut: string;
  plan: Record<string, string>;
  poolKey: Record<string, string>;
};

export function serializePlan(plan: OrderPlan, label: string): StoredPlan {
  return {
    hash: planHash(plan),
    createdAt: Date.now(),
    label,
    tokenIn: plan.tokenIn,
    tokenOut: tokenOutOf(plan),
    plan: {
      salt: plan.salt,
      tokenIn: plan.tokenIn,
      totalAmount: plan.totalAmount.toString(),
      maxSlice: plan.maxSlice.toString(),
      minInterval: plan.minInterval.toString(),
      expiry: plan.expiry.toString(),
      limitNum: plan.limitNum.toString(),
      limitDen: plan.limitDen.toString(),
    },
    poolKey: {
      token0: plan.poolKey.token0,
      token1: plan.poolKey.token1,
      fee: plan.poolKey.fee.toString(),
      tickSpacing: plan.poolKey.tickSpacing.toString(),
      extension: plan.poolKey.extension,
    },
  };
}

export function deserializePlan(stored: StoredPlan): OrderPlan {
  return {
    salt: stored.plan.salt,
    tokenIn: stored.plan.tokenIn,
    poolKey: {
      token0: stored.poolKey.token0,
      token1: stored.poolKey.token1,
      fee: BigInt(stored.poolKey.fee),
      tickSpacing: BigInt(stored.poolKey.tickSpacing),
      extension: stored.poolKey.extension,
    },
    totalAmount: BigInt(stored.plan.totalAmount),
    maxSlice: BigInt(stored.plan.maxSlice),
    minInterval: BigInt(stored.plan.minInterval),
    expiry: BigInt(stored.plan.expiry),
    limitNum: BigInt(stored.plan.limitNum),
    limitDen: BigInt(stored.plan.limitDen),
  };
}
