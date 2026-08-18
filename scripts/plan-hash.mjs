/**
 * Reference plan hash — pinned by `test_plan_hash_matches_frontend` in the Cairo suite.
 *
 * The frontend must derive the same `poseidon(serialize(plan))` as the contract, or it cannot read a
 * plan's progress or build valid invoke calldata. This prints the felts and the hash for one fixed
 * plan; the Cairo test asserts the same value for the same plan.
 *
 *   node scripts/plan-hash.mjs
 */
import { ec, num, shortString } from "starknet";

/** Mirrors `OrderPlan` field order in starknet/src/ghostbook_anonymizer.cairo (15 felts). */
const plan = {
  salt: shortString.encodeShortString("salt-1"),
  tokenIn: 0x111n,
  poolKey: { token0: 0x111n, token1: 0x222n, fee: 7n, tickSpacing: 5n, extension: 0n },
  totalAmount: 3000n,
  maxSlice: 1000n,
  minInterval: 60n,
  expiry: 1086400n,
  limitNum: 1n,
  limitDen: 1n,
};

const u256 = (v) => [v & ((1n << 128n) - 1n), v >> 128n];
const felts = [
  BigInt(plan.salt),
  plan.tokenIn,
  plan.poolKey.token0,
  plan.poolKey.token1,
  plan.poolKey.fee,
  plan.poolKey.tickSpacing,
  plan.poolKey.extension,
  plan.totalAmount,
  plan.maxSlice,
  plan.minInterval,
  plan.expiry,
  ...u256(plan.limitNum),
  ...u256(plan.limitDen),
];

if (felts.length !== 15) throw new Error(`expected 15 felts, got ${felts.length}`);

console.log("felts:");
for (const [i, f] of felts.entries()) console.log(`  [${i}] ${f} (${num.toHex(f)})`);
console.log("\nplan hash:", num.toHex(ec.starkCurve.poseidonHashMany(felts)));
