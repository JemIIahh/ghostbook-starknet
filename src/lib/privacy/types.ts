/**
 * GhostBook private swap — sealed intents + TEE settlement attestation.
 */

export type SealedSwapIntent = {
  version: 1;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: string; // wei decimal string
  amountOutMin: string;
  fee: number;
  recipient: `0x${string}`;
  deadline: number; // unix seconds
  salt: string; // hex
};

export type EncryptedIntentBlob = {
  /** ephemeral secp256k1 compressed pubkey hex (0x…) */
  ephemPub: string;
  /** iv hex */
  iv: string;
  /** ciphertext hex (AES-256-GCM, tag appended) */
  data: string;
};

export const PRIVACY_ROUTER_ABI = [
  "function submitIntent(address tokenIn,uint256 amountIn,bytes32 commitment,bytes ciphertext,uint64 deadline) returns (uint256 id)",
  "function cancel(uint256 id)",
  "function settle(uint256 id,address tokenOut,uint256 amountOutMin,uint24 fee,address recipient,bytes teeSig) returns (uint256 amountOut)",
  "function settlementDigest(uint256 id,address tokenOut,uint256 amountOutMin,uint24 fee,address recipient,uint64 deadline) view returns (bytes32)",
  "function intents(uint256) view returns (address trader,address tokenIn,uint256 amountIn,bytes32 commitment,uint64 deadline,bool open)",
  "function ciphertexts(uint256) view returns (bytes)",
  "function teeSigner() view returns (address)",
  "function nextIntentId() view returns (uint256)",
  "event IntentSubmitted(uint256 indexed id,address indexed trader,address tokenIn,uint256 amountIn,bytes32 commitment,uint64 deadline)",
  "event IntentSettled(uint256 indexed id,address indexed recipient,address tokenOut,uint256 amountOut,uint24 fee)",
] as const;

/** EIP-191 style digest matching PrivacyRouter.settlementDigest + toEthSignedMessageHash. */
export function encodeSettlementDigestParts(args: {
  chainId: number;
  router: string;
  id: bigint;
  tokenOut: string;
  amountOutMin: bigint;
  fee: number;
  recipient: string;
  deadline: number;
}) {
  return [
    args.chainId,
    args.router,
    args.id,
    args.tokenOut,
    args.amountOutMin,
    args.fee,
    args.recipient,
    args.deadline,
  ] as const;
}
