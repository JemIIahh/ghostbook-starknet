"use client";

import { useMemo, useState } from "react";
import { keccak256, toBytes, type Hex } from "viem";
import {
  Lock,
  CheckCircle2,
  XCircle,
  Copy,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import GhostPageShell from "@/components/GhostPageShell";
import GhostLoader from "@/components/GhostLoader";
import {
  CIPHER_SIGN,
  VAULT_SCENARIOS,
  type VaultScenarioId,
  encodePolicy,
  encodeIntent,
  liveConfig,
  sendDirectInstruction,
  checkPolicy,
  friendlyTeeError,
  parseAllowlist,
  isAddress,
  type SignPolicy,
  type SignIntent,
} from "@/lib/cipherSign";

const BAD_RECIPIENT = "0x9999999999999999999999999999999999999999" as const;

type Mode = "live" | "preview";
type StatusKind = "idle" | "ok" | "bad";

export default function VaultPage() {
  const live = liveConfig();
  const [mode, setMode] = useState<Mode>(live ? "live" : "preview");
  const [scenario, setScenario] = useState<VaultScenarioId>("treasury");
  const sc = VAULT_SCENARIOS[scenario];

  const [allowlistRaw, setAllowlistRaw] = useState(sc.allowlist.join("\n"));
  const [maxAmount, setMaxAmount] = useState<string>(sc.maxAmount);
  const [expiresAt, setExpiresAt] = useState(() =>
    String(Math.floor(Date.now() / 1000) + 86400 * 7)
  );
  const [recipient, setRecipient] = useState<string>(sc.allowlist[0]);
  const [intentAmount, setIntentAmount] = useState<string>(sc.intentAmount);
  const [deadline, setDeadline] = useState(() =>
    String(Math.floor(Date.now() / 1000) + 3600)
  );

  const [policy, setPolicy] = useState<SignPolicy | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{
    kind: StatusKind;
    title: string;
    body: string;
  }>({ kind: "idle", title: "Ready", body: "Lock a policy, then request a signature." });
  const [lastSig, setLastSig] = useState("");

  const effectiveMode: Mode = mode === "live" && live ? "live" : "preview";

  const applyScenario = (id: VaultScenarioId) => {
    const next = VAULT_SCENARIOS[id];
    setScenario(id);
    setAllowlistRaw(next.allowlist.join("\n"));
    setMaxAmount(next.maxAmount);
    setIntentAmount(next.intentAmount);
    setRecipient(next.allowlist[0]);
    setPolicy(null);
    setLastSig("");
    setStatus({
      kind: "idle",
      title: "Scenario loaded",
      body: next.hint,
    });
  };

  const readPolicy = (): SignPolicy => ({
    allowedRecipients: parseAllowlist(allowlistRaw),
    maxAmount: BigInt(maxAmount || "0"),
    expiresAt: BigInt(expiresAt || "0"),
  });

  const readIntent = (overrideRecipient?: `0x${string}`, overrideAmount?: bigint): SignIntent => {
    const r = (overrideRecipient ?? recipient.trim()) as `0x${string}`;
    const amount = overrideAmount ?? BigInt(intentAmount || "0");
    return {
      recipient: r,
      amount,
      deadline: BigInt(deadline || "0"),
      payloadHash: keccak256(toBytes(`ghostbook:${r}:${amount}`)),
    };
  };

  const fakeSig = (intentHex: Hex) =>
    `0xpreview${intentHex.slice(2, 66).padEnd(128, "0")}`;

  const lockPolicy = async () => {
    const p = readPolicy();
    if (p.allowedRecipients.length === 0) {
      setStatus({ kind: "bad", title: "Invalid policy", body: "Add at least one allowlisted address." });
      return;
    }
    if (!p.allowedRecipients.every(isAddress)) {
      setStatus({ kind: "bad", title: "Invalid policy", body: "Allowlist must be valid 0x addresses." });
      return;
    }

    setBusy(true);
    try {
      if (effectiveMode === "live" && live) {
        const res = await sendDirectInstruction({
          baseUrl: live.baseUrl,
          apiKey: live.apiKey,
          opType: "KEY",
          opCommand: "SET_POLICY",
          originalMessage: encodePolicy(p),
        });
        if (res.status !== 1) {
          throw new Error(friendlyTeeError(res.log));
        }
        setPolicy(p);
        setStatus({
          kind: "ok",
          title: "Policy locked in TEE",
          body: `Allowlist ${p.allowedRecipients.length} · max ${p.maxAmount.toString()} · Live FCC`,
        });
      } else {
        setPolicy(p);
        setStatus({
          kind: "ok",
          title: "Policy locked (Preview)",
          body: "Same allowlist / cap / expiry rules as the enclave. Start cipher-sign/tee for Live TEE.",
        });
      }
    } catch (e) {
      setStatus({
        kind: "bad",
        title: "Lock failed",
        body: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setBusy(false);
    }
  };

  const requestSign = async (
    kind: "ok" | "overspend" | "wrong"
  ) => {
    if (!policy && effectiveMode === "preview") {
      setStatus({ kind: "bad", title: "No policy", body: "Lock a policy first." });
      return;
    }

    const p = policy ?? readPolicy();
    let intent: SignIntent;
    if (kind === "overspend") {
      intent = readIntent(undefined, p.maxAmount + 1n);
    } else if (kind === "wrong") {
      intent = readIntent(BAD_RECIPIENT);
    } else {
      intent = readIntent();
    }

    setBusy(true);
    setLastSig("");
    try {
      if (effectiveMode === "live" && live) {
        const res = await sendDirectInstruction({
          baseUrl: live.baseUrl,
          apiKey: live.apiKey,
          opType: "KEY",
          opCommand: "SIGN",
          originalMessage: encodeIntent(intent),
        });
        if (res.status !== 1) {
          setStatus({
            kind: "bad",
            title: "TEE refused",
            body: friendlyTeeError(res.log),
          });
          return;
        }
        setLastSig(res.data ?? "");
        setStatus({
          kind: "ok",
          title: "Signed by TEE",
          body: res.data ? `${res.data.slice(0, 42)}…` : "Signature returned",
        });
      } else {
        const err = checkPolicy(p, intent);
        if (err) {
          setStatus({
            kind: "bad",
            title: "Preview refused",
            body: friendlyTeeError(err),
          });
          return;
        }
        const hex = encodeIntent(intent);
        const sig = fakeSig(hex);
        setLastSig(sig);
        setStatus({
          kind: "ok",
          title: "Preview signature",
          body: "Policy passed (client simulation). Live TEE returns a real secp256k1 signature.",
        });
      }
    } catch (e) {
      setStatus({
        kind: "bad",
        title: "Sign failed",
        body: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setBusy(false);
    }
  };

  const modeLabel = useMemo(() => {
    if (effectiveMode === "live") return "Live TEE";
    return live ? "Preview" : "Preview (TEE offline)";
  }, [effectiveMode, live]);

  return (
    <GhostPageShell
      title="Vault"
      subtitle="CipherSign TEE — policy-gated signing only"
      maxWidth="md"
      className="sm:pt-12 pb-16"
      headerRight={
        <div
          className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
            effectiveMode === "live"
              ? "bg-[#b8ff30]/15 text-[#b8ff30] border-[#b8ff30]/30"
              : "bg-surface text-text-secondary border-border"
          }`}
        >
          {modeLabel}
        </div>
      }
    >
        <div className="rounded-2xl bg-surface border border-border p-4 mb-4 text-sm text-text-secondary leading-relaxed">
          Keys stay inside a Flare Confidential Compute TEE. GhostBook operators lock an
          allowlist, max amount, and expiry — then only intents that pass can get a signature.
          This is the <span className="text-foreground">ops / treasury</span> TEE path.
          Trading uses PrivacyRouter on <span className="text-foreground">Swap</span> and{" "}
          <span className="text-foreground">Orders</span>.
        </div>

        {/* Mode + scenario */}
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            onClick={() => setMode("live")}
            disabled={!live}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              effectiveMode === "live"
                ? "bg-[#b8ff30] text-black"
                : "bg-surface border border-border text-text-secondary disabled:opacity-40"
            }`}
          >
            Live TEE
          </button>
          <button
            type="button"
            onClick={() => setMode("preview")}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              effectiveMode === "preview"
                ? "bg-surface-2 text-foreground"
                : "bg-surface border border-border text-text-secondary"
            }`}
          >
            Preview
          </button>
          {(Object.keys(VAULT_SCENARIOS) as VaultScenarioId[]).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => applyScenario(id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                scenario === id
                  ? "bg-primary text-white"
                  : "bg-surface border border-border text-text-secondary hover:text-foreground"
              }`}
            >
              {VAULT_SCENARIOS[id].label}
            </button>
          ))}
        </div>

        <p className="text-xs text-text-tertiary mb-4">{sc.hint}</p>

        {/* Policy */}
        <div className="rounded-3xl bg-surface border border-border p-5 mb-4 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Lock className="w-4 h-4 text-[#b8ff30]" /> Policy
          </div>
          <label className="block text-xs text-text-tertiary">
            Allowlist (one address per line)
            <textarea
              value={allowlistRaw}
              onChange={(e) => setAllowlistRaw(e.target.value)}
              rows={3}
              className="mt-1.5 w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-sm font-mono text-foreground focus:outline-none focus:border-border-hover"
            />
          </label>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-xs text-text-tertiary">
              Max amount
              <input
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
                className="mt-1.5 w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-sm font-mono focus:outline-none"
              />
            </label>
            <label className="block text-xs text-text-tertiary">
              Expires at (unix)
              <input
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="mt-1.5 w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-sm font-mono focus:outline-none"
              />
            </label>
          </div>
          <button
            type="button"
            onClick={lockPolicy}
            disabled={busy}
            className="w-full h-11 rounded-2xl bg-primary hover:bg-primary-hover text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
          >
            {busy ? <GhostLoader size="sm" className="scale-75" /> : "Lock policy"}
          </button>
        </div>

        {/* Intent */}
        <div className="rounded-3xl bg-surface border border-border p-5 mb-4 space-y-4">
          <div className="text-sm font-semibold">Sign intent</div>
          <label className="block text-xs text-text-tertiary">
            Recipient
            <input
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="mt-1.5 w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-sm font-mono focus:outline-none"
            />
          </label>
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-xs text-text-tertiary">
              Amount
              <input
                value={intentAmount}
                onChange={(e) => setIntentAmount(e.target.value)}
                className="mt-1.5 w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-sm font-mono focus:outline-none"
              />
            </label>
            <label className="block text-xs text-text-tertiary">
              Deadline (unix)
              <input
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="mt-1.5 w-full rounded-xl bg-surface-2 border border-border px-3 py-2 text-sm font-mono focus:outline-none"
              />
            </label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => requestSign("ok")}
              disabled={busy}
              className="h-11 rounded-2xl bg-[#b8ff30] text-black font-semibold text-sm disabled:opacity-60"
            >
              Sign valid
            </button>
            <button
              type="button"
              onClick={() => requestSign("overspend")}
              disabled={busy}
              className="h-11 rounded-2xl bg-surface-2 border border-border font-semibold text-sm disabled:opacity-60"
            >
              Overspend
            </button>
            <button
              type="button"
              onClick={() => requestSign("wrong")}
              disabled={busy}
              className="h-11 rounded-2xl bg-surface-2 border border-border font-semibold text-sm disabled:opacity-60"
            >
              Wrong addr
            </button>
          </div>
        </div>

        {/* Status */}
        <div
          className={`rounded-3xl border p-5 ${
            status.kind === "ok"
              ? "bg-[#b8ff30]/10 border-[#b8ff30]/25"
              : status.kind === "bad"
                ? "bg-danger/10 border-danger/25"
                : "bg-surface border-border"
          }`}
        >
          <div className="flex items-start gap-3">
            {status.kind === "ok" ? (
              <CheckCircle2 className="w-5 h-5 text-[#b8ff30] shrink-0 mt-0.5" />
            ) : status.kind === "bad" ? (
              <XCircle className="w-5 h-5 text-danger shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-text-tertiary shrink-0 mt-0.5" />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm">{status.title}</p>
              <p className="text-sm text-text-secondary mt-1 break-all">{status.body}</p>
              {lastSig && (
                <button
                  type="button"
                  onClick={() => navigator.clipboard.writeText(lastSig)}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs text-text-secondary hover:text-foreground"
                >
                  <Copy className="w-3.5 h-3.5" /> Copy signature
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-text-tertiary">
          <a
            href={CIPHER_SIGN.explorerUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            InstructionSender <ExternalLink className="w-3 h-3" />
          </a>
          <span>Extension {CIPHER_SIGN.extensionId.slice(0, 10)}…</span>
          <a
            href="https://cipher-sign.vercel.app"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
          >
            CipherSign demo
          </a>
        </div>

        {!live && (
          <p className="mt-4 text-xs text-text-tertiary leading-relaxed">
            To enable Live TEE: run <code className="text-foreground">cipher-sign/tee</code>{" "}
            Docker stack, then set <code className="text-foreground">NEXT_PUBLIC_FCC_DIRECT_URL=/fcc</code>{" "}
            and <code className="text-foreground">NEXT_PUBLIC_FCC_DIRECT_API_KEY</code> +{" "}
            <code className="text-foreground">FCC_PROXY_URL</code> in <code className="text-foreground">.env.local</code>.
          </p>
        )}
    </GhostPageShell>
  );
}
