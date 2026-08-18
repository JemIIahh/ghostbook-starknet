/**
 * ECIES-style seal for swap intents (secp256k1 ECDH + AES-256-GCM).
 * Client encrypts to TEE pubkey; server/enclave decrypts with TEE private key.
 */

import { ethers } from "ethers";
import type { EncryptedIntentBlob, SealedSwapIntent } from "./types";

function hexToBytes(hex: string): Uint8Array {
  return ethers.getBytes(hex.startsWith("0x") ? hex : `0x${hex}`);
}

function bytesToHex(bytes: Uint8Array): string {
  return ethers.hexlify(bytes);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
}

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", toArrayBuffer(raw), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

function deriveAesKeyMaterial(sharedSecret: string): Uint8Array {
  return hexToBytes(ethers.keccak256(sharedSecret));
}

export function intentCommitment(intent: SealedSwapIntent): `0x${string}` {
  return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(intent))) as `0x${string}`;
}

/** Encrypt sealed swap intent to TEE secp256k1 public key (compressed or uncompressed). */
export async function encryptIntentToPubkey(
  intent: SealedSwapIntent,
  teeCompressedOrUncompressedPub: string
): Promise<{ blob: EncryptedIntentBlob; commitment: `0x${string}`; packed: `0x${string}` }> {
  const plaintext = ethers.toUtf8Bytes(JSON.stringify(intent));
  const commitment = ethers.keccak256(plaintext) as `0x${string}`;

  const ephem = ethers.Wallet.createRandom();
  let teePub = teeCompressedOrUncompressedPub;
  if (!teePub.startsWith("0x")) teePub = `0x${teePub}`;

  const shared = ephem.signingKey.computeSharedSecret(teePub);
  const aesRaw = deriveAesKeyMaterial(shared);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await importAesKey(aesRaw);
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(plaintext)
    )
  );

  const blob: EncryptedIntentBlob = {
    ephemPub: ephem.signingKey.compressedPublicKey,
    iv: bytesToHex(iv),
    data: bytesToHex(sealed),
  };
  const packed = ethers.hexlify(ethers.toUtf8Bytes(JSON.stringify(blob))) as `0x${string}`;
  return { blob, commitment, packed };
}

/** Server-side decrypt. */
export async function decryptIntent(
  packedOrBlob: `0x${string}` | EncryptedIntentBlob,
  teePrivateKeyHex: string
): Promise<SealedSwapIntent> {
  const blob: EncryptedIntentBlob =
    typeof packedOrBlob === "string"
      ? (JSON.parse(ethers.toUtf8String(packedOrBlob)) as EncryptedIntentBlob)
      : packedOrBlob;

  const keyHex = teePrivateKeyHex.startsWith("0x")
    ? teePrivateKeyHex
    : `0x${teePrivateKeyHex}`;
  const tee = new ethers.SigningKey(keyHex);
  const shared = tee.computeSharedSecret(blob.ephemPub);
  const aesRaw = deriveAesKeyMaterial(shared);
  const cryptoKey = await importAesKey(aesRaw);
  const iv = hexToBytes(blob.iv);
  const data = hexToBytes(blob.data);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    cryptoKey,
    toArrayBuffer(data)
  );
  return JSON.parse(new TextDecoder().decode(plainBuf)) as SealedSwapIntent;
}
