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
