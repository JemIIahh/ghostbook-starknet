import type { SignIntent, SignPolicy } from "./fcc";

const ERRORS: Record<string, string> = {
  "no private key stored": "No key loaded in TEE.",
  "policy expired": "Policy expired.",
  "intent deadline passed": "Deadline passed.",
  "recipient not allowed by policy": "Recipient not allowlisted.",
  "amount exceeds policy maxAmount": "Amount exceeds max.",
};

export function friendlyTeeError(raw: string | undefined): string {
  if (!raw) return "TEE rejected the request.";
  const lower = raw.toLowerCase();
  for (const [k, v] of Object.entries(ERRORS)) {
    if (lower.includes(k)) return v;
  }
  return raw;
}

/** Same allowlist / cap / expiry rules as the enclave (Preview mode). */
export function checkPolicy(
  policy: SignPolicy,
  intent: SignIntent
): string | null {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (policy.expiresAt !== 0n && now > policy.expiresAt) return "policy expired";
  if (intent.deadline !== 0n && now > intent.deadline)
    return "intent deadline passed";
  const allowed = policy.allowedRecipients.some(
    (a) => a.toLowerCase() === intent.recipient.toLowerCase()
  );
  if (!allowed) return "recipient not allowed by policy";
  if (intent.amount > policy.maxAmount) return "amount exceeds policy maxAmount";
  return null;
}

export function isAddress(value: string): value is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export function parseAllowlist(raw: string): `0x${string}`[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean) as `0x${string}`[];
}

export function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
