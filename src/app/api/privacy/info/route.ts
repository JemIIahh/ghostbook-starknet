import { NextResponse } from "next/server";
import { getTeeWallet } from "@/lib/privacy/server";
import { getPrivacyRouterAddress } from "@/lib/privacy/server";

/** TEE attestation identity for private swaps. */
export async function GET() {
  const wallet = getTeeWallet();
  if (!wallet) {
    return NextResponse.json(
      {
        error:
          "Privacy TEE not configured. Set PRIVACY_TEE_PRIVATE_KEY (or FAUCET_PRIVATE_KEY) in .env.local.",
        configured: false,
      },
      { status: 503 }
    );
  }

  const pub = wallet.signingKey.compressedPublicKey;
  return NextResponse.json({
    configured: true,
    address: wallet.address,
    publicKey: pub,
    privacyRouter: getPrivacyRouterAddress() || null,
    chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 114),
    note: "Encrypt sealed intents to publicKey (ECIES). Settlements are attested by address.",
  });
}
