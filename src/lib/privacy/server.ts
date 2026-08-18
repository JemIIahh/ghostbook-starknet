import { ethers } from "ethers";
import { UNISWAP_CONFIG } from "@/lib/uniswapConfig";

export function getPrivacyRpc() {
  return (
    process.env.NEXT_PUBLIC_RPC_URL ||
    process.env.COSTON2_RPC_URL ||
    "https://coston2-api.flare.network/ext/C/rpc"
  );
}

/** Private key used as Flare TEE settlement attestor for PrivacyRouter. */
export function getTeePrivateKey(): string {
  const raw =
    process.env.PRIVACY_TEE_PRIVATE_KEY ||
    process.env.FAUCET_PRIVATE_KEY ||
    process.env.PRIVATE_KEY ||
    "";
  return raw.replace(/^0x/, "");
}

export function getTeeWallet(): ethers.Wallet | null {
  const key = getTeePrivateKey();
  if (!key) return null;
  return new ethers.Wallet(`0x${key}`);
}

export function getPrivacyRouterAddress(): string {
  return (
    process.env.NEXT_PUBLIC_PRIVACY_ROUTER ||
    UNISWAP_CONFIG.privacyRouter ||
    ""
  );
}

export function settlementDigest(args: {
  chainId: number;
  router: string;
  id: bigint;
  tokenOut: string;
  amountOutMin: bigint;
  fee: number;
  recipient: string;
  deadline: number;
}): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      [
        "uint256",
        "address",
        "uint256",
        "address",
        "uint256",
        "uint24",
        "address",
        "uint64",
      ],
      [
        args.chainId,
        args.router,
        args.id,
        args.tokenOut,
        args.amountOutMin,
        args.fee,
        args.recipient,
        args.deadline,
      ]
    )
  );
}

export async function signSettlement(
  wallet: ethers.Wallet,
  digest: string
): Promise<string> {
  return wallet.signMessage(ethers.getBytes(digest));
}
