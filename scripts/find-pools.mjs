/**
 * Verify Ekubo pool keys for a pair by probing `get_pool_liquidity` on Ekubo Core.
 *
 * Pool keys are (token0, token1, fee, tick_spacing, extension) and cannot be guessed: this walks a
 * grid of published fee tiers / tick spacings and reports the keys that actually hold liquidity.
 *
 *   node scripts/find-pools.mjs STRK USDC
 */
import { RpcProvider } from "starknet";

const RPC = process.env.NEXT_PUBLIC_RPC_URL_MAINNET || "https://rpc.starknet.lava.build";
const CORE = "0x00000005dd3d2f4429af886cd1a3b08289dbcea99a294197e9eb43b0e0325b4b";
const TOKENS = {
  STRK: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  ETH: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7",
  USDC: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8",
};
const TWO128 = 1n << 128n;
const BPS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 100]; // fee in basis points
const SPACINGS = [1, 10, 50, 100, 200, 354, 500, 1000, 2000, 5982, 10000, 19802];

const [aSym = "STRK", bSym = "USDC"] = process.argv.slice(2);
const a = TOKENS[aSym.toUpperCase()] ?? aSym;
const b = TOKENS[bSym.toUpperCase()] ?? bSym;
const [token0, token1] = BigInt(a) < BigInt(b) ? [a, b] : [b, a];

const provider = new RpcProvider({ nodeUrl: RPC });
const hex = (n) => "0x" + n.toString(16);
const found = [];

for (const bps of BPS) {
  const fee = (TWO128 * BigInt(Math.round(bps * 100))) / 1_000_000n; // bps -> fraction of 2**128
  for (const ts of SPACINGS) {
    const calldata = [token0, token1, hex(fee), hex(BigInt(ts)), "0x0"];
    try {
      const r = await provider.callContract(
        { contractAddress: CORE, entrypoint: "get_pool_liquidity", calldata },
        "latest",
      );
      const liquidity = BigInt(Array.isArray(r) ? r[0] : r.result[0]);
      if (liquidity > 0n) found.push({ feeBps: bps, fee: hex(fee), tick_spacing: ts, liquidity });
    } catch {
      /* pool not initialized for this key */
    }
  }
}

found.sort((x, y) => (y.liquidity > x.liquidity ? 1 : -1));
console.log(`${aSym.toUpperCase()}/${bSym.toUpperCase()}  token0=${token0}  token1=${token1}`);
if (!found.length) console.log("  no liquid pool found with a zero extension in the probed grid");
for (const f of found) {
  console.log(`  fee=${f.fee} (${f.feeBps}bps) tick_spacing=${f.tick_spacing} liquidity=${f.liquidity}`);
}
