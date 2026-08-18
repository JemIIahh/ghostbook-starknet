/**
 * STRK20 actions, submitted through the user's wallet.
 *
 * Every private operation is a list of `STRK20_ACTION`s handed to
 * `WalletAccountV6.strk20InvokeTransaction`. The wallet assembles, proves and relays them; the dapp
 * never sees a viewing key and never talks to the prover.
 *
 * The strings `"OPEN"`, `"${poolAddress}"` and `"${openNoteIds[0]}"` are literal placeholders the
 * wallet substitutes while assembling. They must be passed through verbatim — hex-normalizing them
 * breaks the transaction.
 */

import { num } from "starknet";
import type { WALLET_API } from "@starknet-io/types-js";
import type { OrderPlan } from "@/lib/strk20/plan";
import { planCalldata, tokenOutOf } from "@/lib/strk20/plan";

export const OPEN_NOTE_AMOUNT = "OPEN";
export const POOL_ADDRESS_PLACEHOLDER = "${poolAddress}";
export const OPEN_NOTE_ID_PLACEHOLDER = "${openNoteIds[0]}";

/** Shield: move ERC-20 into the pool as an encrypted note. Public — amount and depositor are visible. */
export function shieldActions(token: string, amount: bigint): WALLET_API.STRK20_ACTION[] {
  return [{ type: "deposit", token: num.toHex(token), amount: num.toHex(amount) }];
}

/** Unshield: withdraw from a note to a public address. Destination and amount are public. */
export function unshieldActions(
  token: string,
  amount: bigint,
  recipient: string,
): WALLET_API.STRK20_ACTION[] {
  return [
    {
      type: "withdraw",
      token: num.toHex(token),
      amount: num.toHex(amount),
      recipient: num.toHex(recipient),
    },
  ];
}

/** Note-to-note transfer: the actually-private operation — no amount, no parties on-chain. */
export function privateTransferActions(
  token: string,
  amount: bigint,
  recipient: string,
): WALLET_API.STRK20_ACTION[] {
  return [
    {
      type: "transfer",
      token: num.toHex(token),
      amount: num.toHex(amount),
      recipient: num.toHex(recipient),
    },
  ];
}

/**
 * One slice of an order plan, as a single private transaction:
 *
 *  1. withdraw exactly `amountIn` of the sold token to the anonymizer,
 *  2. open a note for the bought token, owned by the trader,
 *  3. invoke the anonymizer, which swaps on Ekubo under the plan's committed terms and hands the
 *     output back for the pool to deposit into that note.
 *
 * The pool runs all three atomically: if the limit price isn't met, the whole transaction reverts
 * and nothing left the pool.
 */
export function fillSliceActions(input: {
  plan: OrderPlan;
  anonymizer: string;
  ekuboRouter: string;
  amountIn: bigint;
  /** Owner of the open note that receives the output — the trader's own account. */
  noteOwner: string;
  skipAhead?: bigint;
}): WALLET_API.STRK20_ACTION[] {
  const { plan, anonymizer, ekuboRouter, amountIn, noteOwner, skipAhead = 0n } = input;
  const helper = num.toHex(anonymizer);

  return [
    {
      type: "withdraw",
      token: num.toHex(plan.tokenIn),
      amount: num.toHex(amountIn),
      recipient: helper,
    },
    {
      type: "transfer",
      token: num.toHex(tokenOutOf(plan)),
      amount: OPEN_NOTE_AMOUNT,
      recipient: num.toHex(noteOwner),
    },
    {
      type: "invoke",
      contract: helper,
      calldata: [
        ...planCalldata(plan),
        num.toHex(ekuboRouter),
        num.toHex(amountIn),
        num.toHex(skipAhead),
        OPEN_NOTE_ID_PLACEHOLDER,
      ],
    },
  ];
}

export type ShieldedBalance = {
  token: string;
  amount: bigint;
};

/** Normalizes the wallet's `strk20Balances` response, whose shape varies by wallet. */
export function parseShieldedBalances(raw: unknown): ShieldedBalance[] {
  const value = (raw as { value?: unknown })?.value ?? raw;
  if (!Array.isArray(value)) return [];
  const balances: ShieldedBalance[] = [];
  for (const entry of value) {
    const item = entry as Record<string, unknown> & unknown[];
    const token = (item?.token ?? item?.token_address ?? item?.[0]) as string | undefined;
    const amount = (item?.amount ?? item?.balance ?? item?.[1]) as string | number | undefined;
    if (token === undefined || amount === undefined) continue;
    try {
      balances.push({ token: num.toHex(token), amount: BigInt(amount) });
    } catch {
      continue;
    }
  }
  return balances;
}
