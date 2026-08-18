/**
 * Flare FCC /direct client for CipherSign TEE (GhostBook).
 * POST /direct → action id → poll GET /action/result/:id
 */

import { encodeAbiParameters, type Hex } from "viem";

export type SignPolicy = {
  allowedRecipients: `0x${string}`[];
  maxAmount: bigint;
  expiresAt: bigint;
};

export type SignIntent = {
  recipient: `0x${string}`;
  amount: bigint;
  deadline: bigint;
  payloadHash: Hex;
};

export function encodePolicy(policy: SignPolicy): Hex {
  return encodeAbiParameters(
    [{ type: "address[]" }, { type: "uint256" }, { type: "uint256" }],
    [policy.allowedRecipients, policy.maxAmount, policy.expiresAt]
  );
}

export function encodeIntent(intent: SignIntent): Hex {
  return encodeAbiParameters(
    [
      { type: "address" },
      { type: "uint256" },
      { type: "uint256" },
      { type: "bytes32" },
    ],
    [intent.recipient, intent.amount, intent.deadline, intent.payloadHash]
  );
}

/** bytes32-padded ASCII for FCC opType/opCommand fields. */
export function stringToBytes32Hex(s: string): Hex {
  const bytes = new TextEncoder().encode(s);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}${"0".repeat(64 - hex.length)}` as Hex;
}

export type DirectResult = {
  status: number;
  data?: string;
  log?: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractActionId(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (typeof o.id === "string") return o.id;
  const data = o.data;
  if (data && typeof data === "object") {
    const id = (data as Record<string, unknown>).id;
    if (typeof id === "string") return id;
  }
  return null;
}

function normalizeResult(parsed: Record<string, unknown>): DirectResult | null {
  const nested = parsed.result ?? parsed.Result;
  const src =
    nested && typeof nested === "object"
      ? (nested as Record<string, unknown>)
      : parsed;
  if (src.status === undefined && src.Status === undefined) return null;
  const status = Number(src.status ?? src.Status ?? -1);
  const dataRaw = src.data ?? src.Data;
  const logRaw = src.log ?? src.Log;
  let data: string | undefined;
  if (typeof dataRaw === "string") data = dataRaw;
  else if (dataRaw != null) data = String(dataRaw);
  return {
    status,
    data,
    log: typeof logRaw === "string" ? logRaw : undefined,
  };
}

async function pollActionResult(
  baseUrl: string,
  actionId: string,
  timeoutMs = 60_000
): Promise<DirectResult> {
  const url = `${baseUrl.replace(/\/$/, "")}/action/result/${actionId}?submissionTag=submit`;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await fetch(url);
    if (res.status === 404 || res.status === 204) {
      await sleep(500);
      continue;
    }
    const text = await res.text();
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      await sleep(500);
      continue;
    }
    const out = normalizeResult(parsed);
    if (!out || out.status < 0) {
      await sleep(500);
      continue;
    }
    return out;
  }
  throw new Error(`Timed out waiting for action result ${actionId}`);
}

/** Call TEE proxy POST /direct, then poll for result. */
export async function sendDirectInstruction(opts: {
  baseUrl: string;
  apiKey: string;
  opType: string;
  opCommand: string;
  originalMessage: Hex | string;
  timeoutMs?: number;
}): Promise<DirectResult> {
  const base = opts.baseUrl.replace(/\/$/, "");
  const url = `${base}/direct`;

  const message =
    typeof opts.originalMessage === "string" &&
    opts.originalMessage.startsWith("0x")
      ? opts.originalMessage
      : opts.originalMessage;

  const body = {
    opType: stringToBytes32Hex(opts.opType),
    opCommand: stringToBytes32Hex(opts.opCommand),
    message,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": opts.apiKey,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`Direct API non-JSON (${res.status}): ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    const errObj = parsed as DirectResult;
    throw new Error(
      `Direct API HTTP ${res.status}: ${errObj.log ?? text.slice(0, 200)}`
    );
  }

  const inline = parsed as DirectResult & { Status?: number };
  if (typeof inline.status === "number" || typeof inline.Status === "number") {
    return {
      status: Number(inline.status ?? inline.Status),
      data: inline.data,
      log: inline.log,
    };
  }

  const actionId = extractActionId(parsed);
  if (!actionId) {
    throw new Error(`Direct API missing action id: ${text.slice(0, 240)}`);
  }
  return pollActionResult(base, actionId, opts.timeoutMs ?? 60_000);
}

/** Browser config — same-origin `/fcc` via Next rewrite, or absolute tunnel URL. */
export function liveConfig(): { baseUrl: string; apiKey: string } | null {
  const baseUrl = process.env.NEXT_PUBLIC_FCC_DIRECT_URL;
  const apiKey = process.env.NEXT_PUBLIC_FCC_DIRECT_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return { baseUrl, apiKey };
}
