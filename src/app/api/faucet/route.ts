import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { MINTABLE_TOKENS } from "@/lib/uniswapConfig";

const THRESHOLD = 100n;
const MINT_ABI = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function mint(address to, uint256 amount)",
  "function symbol() view returns (string)",
  "function owner() view returns (address)",
];

/** Simple per-address cooldown (ms) to limit spam. */
const COOLDOWN_MS = 30_000;
const lastDrip = new Map<string, number>();

function getRpc() {
  return (
    process.env.NEXT_PUBLIC_RPC_URL ||
    process.env.COSTON2_RPC_URL ||
    "https://coston2-api.flare.network/ext/C/rpc"
  );
}

function getFaucetKey() {
  return (
    process.env.FAUCET_PRIVATE_KEY ||
    process.env.PRIVATE_KEY ||
    ""
  ).replace(/^0x/, "");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { address?: string };
    const to = (body.address || "").trim();

    if (!ethers.isAddress(to)) {
      return NextResponse.json({ error: "Valid wallet address required." }, { status: 400 });
    }

    const key = getFaucetKey();
    if (!key) {
      return NextResponse.json(
        {
          error:
            "Faucet not configured. Set FAUCET_PRIVATE_KEY (token owner) in .env.local.",
        },
        { status: 503 }
      );
    }

    const addrKey = to.toLowerCase();
    const now = Date.now();
    const prev = lastDrip.get(addrKey) ?? 0;
    if (now - prev < COOLDOWN_MS) {
      const wait = Math.ceil((COOLDOWN_MS - (now - prev)) / 1000);
      return NextResponse.json(
        { error: `Please wait ${wait}s before dripping again.` },
        { status: 429 }
      );
    }

    const provider = new ethers.JsonRpcProvider(getRpc());
    const wallet = new ethers.Wallet(`0x${key}`, provider);

    // Fail fast if key cannot mint (wrong owner)
    {
      const probe = new ethers.Contract(MINTABLE_TOKENS[0].address, MINT_ABI, provider);
      const owner: string = await probe.owner();
      if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
        return NextResponse.json(
          {
            error: `FAUCET_PRIVATE_KEY wallet ${wallet.address.slice(0, 8)}… is not token owner ${owner.slice(0, 8)}…. Use the deployer key.`,
          },
          { status: 503 }
        );
      }
    }

    const native = await provider.getBalance(wallet.address);
    if (native === 0n) {
      return NextResponse.json(
        { error: "Faucet wallet has 0 C2FLR for gas. Fund the deployer on Coston2." },
        { status: 503 }
      );
    }

    const results: Array<{
      symbol: string;
      skipped: boolean;
      balanceBefore: string;
      minted: string;
      txHash?: string;
    }> = [];

    for (const token of MINTABLE_TOKENS) {
      const contract = new ethers.Contract(token.address, MINT_ABI, wallet);
      const decimals: number = Number(await contract.decimals());
      const thresholdWei = THRESHOLD * 10n ** BigInt(decimals);
      const bal: bigint = await contract.balanceOf(to);
      const balHuman = ethers.formatUnits(bal, decimals);

      if (bal >= thresholdWei) {
        results.push({
          symbol: token.symbol,
          skipped: true,
          balanceBefore: balHuman,
          minted: "0",
        });
        continue;
      }

      const amount = thresholdWei - bal;
      const tx = await contract.mint(to, amount);
      await tx.wait();
      results.push({
        symbol: token.symbol,
        skipped: false,
        balanceBefore: balHuman,
        minted: ethers.formatUnits(amount, decimals),
        txHash: tx.hash,
      });
    }

    lastDrip.set(addrKey, Date.now());

    const dripped = results.filter((r) => !r.skipped);
    const skipped = results.filter((r) => r.skipped);

    return NextResponse.json({
      ok: true,
      address: to,
      message:
        dripped.length === 0
          ? "All GHOST / BOOK / SPARK balances are already ≥ 100."
          : `Dripped ${dripped.map((r) => `${r.minted} ${r.symbol}`).join(", ")}.`,
      dripped,
      skipped,
      results,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Faucet drip failed.";
    const lower = msg.toLowerCase();
    let friendly = msg;
    if (lower.includes("onlyowner") || lower.includes("ownable")) {
      friendly =
        "Faucet wallet is not the token owner. Use the deployer key as FAUCET_PRIVATE_KEY.";
    }
    return NextResponse.json({ error: friendly }, { status: 500 });
  }
}
