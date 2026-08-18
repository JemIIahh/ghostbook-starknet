/**
 * Turn wallet / RPC / contract errors into short UI copy.
 *
 * The interesting cases are the anonymizer's own assertions: a fill that violates the committed
 * order terms reverts with a felt short-string, and the user deserves to know which rule stopped it
 * rather than "execution reverted".
 */

/** `GhostBookAnonymizer` and Ekubo assertion strings, mapped to plain language. */
const CONTRACT_ERRORS: Record<string, string> = {
  NOT_PRIVACY_POOL: "Only the STRK20 pool can fill a slice. Check the anonymizer address.",
  SLICE_TOO_LARGE: "That slice is bigger than the plan's per-fill cap.",
  PLAN_EXHAUSTED: "This plan's total budget is already filled.",
  PLAN_EXPIRED: "This plan has expired. Create a new one to keep trading.",
  INTERVAL_NOT_ELAPSED: "Too soon — the plan's minimum interval between slices hasn't elapsed.",
  LIMIT_PRICE_NOT_MET: "The market is below your limit price, so the fill was rejected.",
  CLEAR_AT_LEAST_MINIMUM: "The market is below your limit price, so the fill was rejected.",
  CLEAR_MINIMUM_NOT_MET: "The market is below your limit price, so the fill was rejected.",
  IN_TOKEN_NOT_CLEARED: "Ekubo could only partially fill this slice. Try a smaller slice.",
  BALANCE_NOT_SLICE: "The withdrawn amount didn't match the slice. Retry the fill.",
  TOKEN_MISMATCH_POOL_KEY: "The plan's token isn't part of that Ekubo pool.",
  ZERO_LIMIT: "Set a limit price before filling.",
  ZERO_IN_AMOUNT: "Slice amount must be greater than zero.",
  NOTE_ALREADY_DEPOSITED: "That open note was already filled. Refresh and try again.",
  INSUFFICIENT_BALANCE: "Not enough shielded balance for this slice.",
};

export function friendlyError(err: unknown, fallback = "Something went wrong."): string {
  const raw =
    err instanceof Error ? err.message : typeof err === "string" ? err : fallback;
  const lower = raw.toLowerCase();

  // User dismissed the wallet dialog.
  if (
    lower.includes("user rejected") ||
    lower.includes("user denied") ||
    lower.includes("user abort") ||
    lower.includes("rejected the request")
  ) {
    return "Transaction rejected in wallet.";
  }

  // Contract assertions come back embedded in the RPC error payload.
  for (const [code, message] of Object.entries(CONTRACT_ERRORS)) {
    if (raw.includes(code)) return message;
  }

  if (lower.includes("strk20") && lower.includes("not supported")) {
    return "This wallet doesn't implement the STRK20 wallet API yet. Ready supports it today.";
  }
  if (lower.includes("no wallet") || lower.includes("no walletaccount")) {
    return "Connect a Starknet wallet first.";
  }
  if (lower.includes("chain") && lower.includes("mismatch")) {
    return "Wrong network. Switch your wallet to Starknet Mainnet.";
  }
  if (lower.includes("viewing key") || lower.includes("not registered")) {
    return "Register your viewing key with the pool before moving value privately.";
  }
  if (lower.includes("screening") || lower.includes("compliance")) {
    return "The deposit screening provider rejected this deposit.";
  }
  if (lower.includes("insufficient") && lower.includes("fee")) {
    return "Not enough STRK to cover fees.";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "The node stopped responding while confirming. The transaction may still land.";
  }
  if (lower.includes("fetch failed") || lower.includes("network error")) {
    return "Couldn't reach the Starknet RPC. Check your connection.";
  }
  if (lower.includes("execution reverted") || lower.includes("transaction reverted")) {
    return "The transaction reverted on-chain.";
  }

  return trim(raw) || fallback;
}

/** Strips RPC noise so a raw message is still readable if it reaches the UI. */
function trim(message: string): string {
  return message
    .replace(/RPC: \w+ with params .*/s, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}
