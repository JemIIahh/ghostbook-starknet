/**
 * Turn ethers / MetaMask / RPC errors into short UI-friendly copy.
 */
export function friendlyError(err: unknown, fallback = "Something went wrong."): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : fallback;

  const lower = raw.toLowerCase();

  // User rejected in wallet
  if (
    lower.includes("user rejected") ||
    lower.includes("user denied") ||
    lower.includes("rejected the request") ||
    lower.includes("action_rejected") ||
    (err as { code?: number | string })?.code === 4001 ||
    (err as { code?: string })?.code === "ACTION_REJECTED"
  ) {
    return "Transaction rejected in wallet.";
  }

  // Our own preflight messages — keep as-is
  if (
    raw.startsWith("No pool for") ||
    raw.startsWith("Pool not found") ||
    raw.startsWith("No wallet") ||
    raw.startsWith("Connect wallet") ||
    raw.startsWith("Recipient") ||
    raw.startsWith("Enter a")
  ) {
    return raw;
  }

  if (lower.includes("no pool") || lower.includes("pool not found")) {
    return "Pool not found for this pair and fee. Create it on Admin first.";
  }

  if (lower.includes("insufficient funds") || lower.includes("insufficient balance")) {
    return "Insufficient balance for this transaction.";
  }

  if (
    lower.includes("insufficient allowance") ||
    lower.includes("transfer amount exceeds allowance") ||
    lower.includes("erc20: insufficient allowance")
  ) {
    return "Token not approved. Approve the token, then try again.";
  }

  if (
    lower.includes("transfer amount exceeds balance") ||
    lower.includes("exceeds balance")
  ) {
    return "Not enough token balance.";
  }

  if (lower.includes("notenoughliquidity") || lower.includes("not enough liquidity")) {
    return "Not enough liquidity in the pool for this trade.";
  }

  if (lower.includes("invalid pricelimit") || lower.includes("invalidtick")) {
    return "Invalid price or tick range for this pool.";
  }

  if (lower.includes("slippagecheckfailed") || lower.includes("toolittlereceived")) {
    return "Price moved too much. Try again or widen slippage.";
  }

  if (lower.includes("onlyowner") || lower.includes("ownable")) {
    return "Only the contract owner can do this (use the deployer wallet).";
  }

  if (lower.includes("nonce") && lower.includes("too low")) {
    return "Wallet nonce conflict. Reset account in MetaMask or wait and retry.";
  }

  if (lower.includes("underpriced") || lower.includes("replacement fee")) {
    return "Gas price too low. Speed up or retry the transaction.";
  }

  if (
    lower.includes("missing revert data") ||
    lower.includes("call_exception") ||
    lower.includes("estimategas") ||
    lower.includes("execution reverted") ||
    lower.includes("require(false)")
  ) {
    if (lower.includes("mint") || lower.includes("liquidity")) {
      return "Liquidity failed. Check the pool exists, ticks are valid, and you have balances.";
    }
    if (lower.includes("swap")) {
      return "Swap failed. Check pool liquidity, approval, and token balance.";
    }
    return "Transaction would fail on-chain. Check pool, liquidity, approval, and balances.";
  }

  if (lower.includes("network") && (lower.includes("changed") || lower.includes("mismatch"))) {
    return "Wrong network. Switch MetaMask to Flare Coston2 (chain 114).";
  }

  if (lower.includes("failed to fetch") || lower.includes("network error") || lower.includes("timeout")) {
    return "Network error. Check your connection and RPC, then retry.";
  }

  // Strip noisy ethers wrappers: keep first sentence / truncate
  let cleaned = raw
    .replace(/^Error:\s*/i, "")
    .replace(/\s*\(action="[^"]*".*$/s, "")
    .replace(/\s*\[ See:.*$/s, "")
    .replace(/\s*version=\S+/g, "")
    .trim();

  if (cleaned.length > 140) {
    cleaned = `${cleaned.slice(0, 137)}…`;
  }

  return cleaned || fallback;
}
