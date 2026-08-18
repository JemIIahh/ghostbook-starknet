/**
 * Quote a single-hop swap through the Ekubo router the anonymizer calls.
 *
 * This is the authoritative check that a pool key is usable: it exercises the exact router and
 * route node `GhostBookAnonymizer.privacy_invoke` uses.
 *
 *   node scripts/quote.mjs STRK ETH 1
 */
import { RpcProvider } from "starknet";

const RPC = process.env.NEXT_PUBLIC_RPC_URL_MAINNET || "https://rpc.starknet.lava.build";
const ROUTER = "0x0199741822c2dc722f6f605204f35e56dbc23bceed54818168c4c49e4fb8737e";
const TOKENS = {
  STRK: { address: "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d", decimals: 18 },
  ETH: { address: "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7", decimals: 18 },
  USDC: { address: "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8", decimals: 6 },
};
const TWO128 = 1n << 128n;
const hex = (n) => "0x" + n.toString(16);
const feeFromBps = (bps) => (TWO128 * BigInt(Math.round(bps * 100))) / 1_000_000n;

const [inSym = "STRK", outSym = "ETH", amountStr = "1"] = process.argv.slice(2);
const tin = TOKENS[inSym.toUpperCase()];
const tout = TOKENS[outSym.toUpperCase()];
const amount = BigInt(Math.round(Number(amountStr) * 10 ** tin.decimals));
const [token0, token1] =
  BigInt(tin.address) < BigInt(tout.address) ? [tin.address, tout.address] : [tout.address, tin.address];

const provider = new RpcProvider({ nodeUrl: RPC });
const GRID = [
  [0.05, 200], [0.05, 1000], [0.1, 1000], [0.25, 1000], [0.3, 5982],
  [0.5, 5982], [1, 5982], [5, 5982], [30, 5982], [100, 19802],
];

for (const [bps, ts] of GRID) {
  const calldata = [
    token0, token1, hex(feeFromBps(bps)), hex(BigInt(ts)), "0x0", // pool_key
    "0x0", "0x0",                                                  // sqrt_ratio_limit (u256)
    "0x0",                                                         // skip_ahead
    tin.address, hex(amount), "0x0",                               // token_amount: token, i129{mag, sign}
  ];
  try {
    const r = await provider.callContract({ contractAddress: ROUTER, entrypoint: "quote_swap", calldata }, "latest");
    const raw = Array.isArray(r) ? r : r.result;
    // Delta { amount0: i129{mag, sign}, amount1: i129{mag, sign} }
    const [mag0, sign0, mag1, sign1] = raw.map((v) => BigInt(v));
    const inIsToken0 = BigInt(tin.address) === BigInt(token0);
    const outMag = inIsToken0 ? mag1 : mag0;
    const outSign = inIsToken0 ? sign1 : sign0;
    const out = Number(outMag) / 10 ** tout.decimals;
    console.log(
      `fee=${bps}bps ts=${ts} -> out=${out} ${outSym.toUpperCase()} (sign=${outSign}) fee_raw=${hex(feeFromBps(bps))}`,
    );
  } catch (e) {
    const msg = String(e?.message ?? e).replace(/\s+/g, " ").slice(0, 90);
    console.log(`fee=${bps}bps ts=${ts} -> ${msg}`);
  }
}
