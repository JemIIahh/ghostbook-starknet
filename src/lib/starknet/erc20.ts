/**
 * Public ERC-20 reads.
 *
 * Distinct from `useShieldedBalances`, which asks the *wallet* for balances held inside the STRK20
 * pool. This reads what anyone can see: the token balance of a public address. Both numbers matter
 * and they are not interchangeable — shielding spends the public one, trading spends the private
 * one — so conflating them tells the user they have nothing when they don't.
 */

import type { ProviderInterface } from "starknet";

/** `balanceOf(owner)` as a u256, or null when the call fails. */
export async function readErc20Balance(
  provider: ProviderInterface,
  token: string,
  owner: string,
): Promise<bigint | null> {
  try {
    const result = await provider.callContract({
      contractAddress: token,
      entrypoint: "balanceOf",
      calldata: [owner],
    });
    const low = BigInt(result[0] ?? "0x0");
    const high = BigInt(result[1] ?? "0x0");
    return low + (high << 128n);
  } catch {
    return null;
  }
}

/**
 * Whether `owner` has a viewing key registered with the privacy pool.
 *
 * The pool keys every private balance to a viewing key set through `ClientAction::SetViewingKey`,
 * and rejects any action from an address without one — the revert reads `NOT_REGISTERED`. The wallet
 * API exposes only deposit / withdraw / transfer / invoke, so a dapp *cannot* register on the user's
 * behalf: it has to happen inside the wallet. All we can do is detect it and say so before the user
 * spends a transaction discovering it.
 *
 * Returns null when the pool can't be reached, so a dead RPC isn't reported as "not registered".
 */
export async function isViewingKeyRegistered(
  provider: ProviderInterface,
  pool: string,
  owner: string,
): Promise<boolean | null> {
  try {
    const result = await provider.callContract({
      contractAddress: pool,
      entrypoint: "get_public_key",
      calldata: [owner],
    });
    return BigInt(result[0] ?? "0x0") !== 0n;
  } catch {
    return null;
  }
}
