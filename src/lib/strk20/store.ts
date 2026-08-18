/**
 * Local plan storage.
 *
 * A plan's terms — including its secret salt — must be re-supplied on every fill, and the contract
 * stores only the hash. Nothing on-chain can reconstruct a plan, so the browser keeps the terms.
 * Losing them means the remaining budget can never be filled, which is why plans are exportable.
 */

import type { OrderPlan, StoredPlan } from "@/lib/strk20/plan";
import { deserializePlan, serializePlan } from "@/lib/strk20/plan";

const KEY_PREFIX = "ghostbook:plans";

function storageKey(network: string, address: string): string {
  return `${KEY_PREFIX}:${network}:${address.toLowerCase()}`;
}

export function loadPlans(network: string, address: string | null): StoredPlan[] {
  if (!address || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(network, address));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredPlan[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persist(network: string, address: string, plans: StoredPlan[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(network, address), JSON.stringify(plans));
}

export function savePlan(
  network: string,
  address: string,
  plan: OrderPlan,
  label: string,
): StoredPlan[] {
  const stored = serializePlan(plan, label);
  const existing = loadPlans(network, address).filter((p) => p.hash !== stored.hash);
  const next = [stored, ...existing];
  persist(network, address, next);
  return next;
}

export function removePlan(network: string, address: string, planHash: string): StoredPlan[] {
  const next = loadPlans(network, address).filter((p) => p.hash !== planHash);
  persist(network, address, next);
  return next;
}

export function plansWithTerms(
  network: string,
  address: string | null,
): Array<{ stored: StoredPlan; plan: OrderPlan }> {
  return loadPlans(network, address)
    .map((stored) => {
      try {
        return { stored, plan: deserializePlan(stored) };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is { stored: StoredPlan; plan: OrderPlan } => entry !== null);
}

/** Plans are only recoverable from a backup: the contract keeps hashes, not terms. */
export function exportPlans(network: string, address: string | null): string {
  return JSON.stringify(loadPlans(network, address), null, 2);
}

export function importPlans(network: string, address: string, json: string): StoredPlan[] {
  const parsed = JSON.parse(json) as StoredPlan[];
  if (!Array.isArray(parsed)) throw new Error("Expected a JSON array of plans");
  const existing = loadPlans(network, address);
  const byHash = new Map(existing.map((p) => [p.hash, p]));
  for (const plan of parsed) {
    if (plan?.hash && plan?.plan && plan?.poolKey) byHash.set(plan.hash, plan);
  }
  const next = [...byHash.values()].sort((a, b) => b.createdAt - a.createdAt);
  persist(network, address, next);
  return next;
}
