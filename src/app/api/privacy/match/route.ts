import { NextResponse } from "next/server";
import { ethers } from "ethers";
import { decryptIntent } from "@/lib/privacy/crypto";
import {
  getPrivacyRpc,
  getPrivacyRouterAddress,
  getTeePrivateKey,
  getTeeWallet,
  signSettlement,
} from "@/lib/privacy/server";
import { UNISWAP_CONFIG } from "@/lib/uniswapConfig";
import { QUOTER_ABI } from "@/lib/uniswapAbis";

/**
 * TEE match + attest:
 * 1. Decrypt sealed intent
 * 2. Quote Uniswap privately (server-side)
 * 3. Sign settlement digest for PrivacyRouter.settle
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      intentId?: string | number;
      ciphertext?: string;
      /** Optional override if ciphertext not fetched from chain */
      commitment?: string;
    };

    const wallet = getTeeWallet();
    const teeKey = getTeePrivateKey();
    if (!wallet || !teeKey) {
      return NextResponse.json(
        { error: "Privacy TEE not configured (PRIVACY_TEE_PRIVATE_KEY)." },
        { status: 503 }
      );
    }

    const routerAddr = getPrivacyRouterAddress();
    if (!routerAddr) {
      return NextResponse.json(
        {
          error:
            "PrivacyRouter not deployed. Set NEXT_PUBLIC_PRIVACY_ROUTER or uniswapConfig.privacyRouter.",
        },
        { status: 503 }
      );
    }

    if (body.intentId === undefined || body.intentId === null) {
      return NextResponse.json({ error: "intentId required" }, { status: 400 });
    }

    const intentId = BigInt(body.intentId);
    const provider = new ethers.JsonRpcProvider(getPrivacyRpc());
    const router = new ethers.Contract(
      routerAddr,
      [
        "function intents(uint256) view returns (address trader,address tokenIn,uint256 amountIn,bytes32 commitment,uint64 deadline,bool open)",
        "function ciphertexts(uint256) view returns (bytes)",
        "function settlementDigest(uint256,address,uint256,uint24,address,uint64) view returns (bytes32)",
      ],
      provider
    );

    const onchain = await router.intents(intentId);
    if (!onchain.open) {
      return NextResponse.json({ error: "Intent not open" }, { status: 400 });
    }

    const ciphertextHex: string =
      body.ciphertext || (await router.ciphertexts(intentId));

    const sealed = await decryptIntent(ciphertextHex as `0x${string}`, teeKey);

    // Verify commitment matches escrow
    const recomputed = ethers.keccak256(
      ethers.toUtf8Bytes(JSON.stringify(sealed))
    );
    if (recomputed.toLowerCase() !== String(onchain.commitment).toLowerCase()) {
      return NextResponse.json(
        { error: "Commitment mismatch — ciphertext does not match escrow" },
        { status: 400 }
      );
    }

    if (sealed.tokenIn.toLowerCase() !== String(onchain.tokenIn).toLowerCase()) {
      return NextResponse.json({ error: "tokenIn mismatch" }, { status: 400 });
    }
    if (BigInt(sealed.amountIn) !== BigInt(onchain.amountIn)) {
      return NextResponse.json({ error: "amountIn mismatch" }, { status: 400 });
    }

    const now = Math.floor(Date.now() / 1000);
    if (sealed.deadline < now || Number(onchain.deadline) < now) {
      return NextResponse.json({ error: "Intent expired" }, { status: 400 });
    }

    // Private quote against Uniswap quoter
    const quoter = new ethers.Contract(
      UNISWAP_CONFIG.quoterAddress,
      QUOTER_ABI,
      provider
    );
    let quotedOut: bigint;
    try {
      const result = await quoter.quoteSingle.staticCall({
        tokenIn: sealed.tokenIn,
        tokenOut: sealed.tokenOut,
        fee: sealed.fee,
        amountIn: BigInt(sealed.amountIn),
        sqrtPriceLimitX96: 0n,
      });
      quotedOut = BigInt(result[0] ?? result);
    } catch {
      return NextResponse.json(
        {
          error:
            "No pool liquidity for this pair/fee. Create pool + add LP on Admin first.",
        },
        { status: 400 }
      );
    }

    const minOut = BigInt(sealed.amountOutMin);
    if (quotedOut < minOut) {
      return NextResponse.json(
        {
          error: `Quote ${quotedOut.toString()} below minOut ${minOut.toString()}`,
          quotedOut: quotedOut.toString(),
        },
        { status: 400 }
      );
    }

    // Use on-chain digest helper to stay byte-identical with the contract
    const digest: string = await router.settlementDigest(
      intentId,
      sealed.tokenOut,
      minOut,
      sealed.fee,
      sealed.recipient,
      Number(onchain.deadline)
    );

    const teeSig = await signSettlement(wallet, digest);

    return NextResponse.json({
      ok: true,
      intentId: intentId.toString(),
      tokenOut: sealed.tokenOut,
      amountOutMin: minOut.toString(),
      quotedOut: quotedOut.toString(),
      fee: sealed.fee,
      recipient: sealed.recipient,
      deadline: Number(onchain.deadline),
      digest,
      teeSig,
      teeSigner: wallet.address,
      privacyLeakNote:
        "tokenOut / minOut were private until this attestation. Settlement swap amounts become public on-chain at fill.",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Match failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
