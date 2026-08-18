"use client";

import Link from "next/link";
import { MAINNET, explorerContractUrl } from "@/lib/starknet/config";

const MECHANISM = [
  {
    n: "01",
    title: "Commit the plan",
    body: "Limit price, slice size, total budget, minimum interval, expiry — hashed with your secret salt. The contract stores poseidon(plan), never the terms.",
  },
  {
    n: "02",
    title: "Fill a slice",
    body: "One private transaction: the pool withdraws a slice to the anonymizer, opens a note for the output, and invokes. Ekubo prices the swap.",
  },
  {
    n: "03",
    title: "Terms hold, or it reverts",
    body: "Wrong price, oversized slice, too soon, past expiry, partial fill — each one aborts the whole transaction. Nothing leaves the pool.",
  },
  {
    n: "04",
    title: "Output lands private",
    body: "The bought token is credited straight into your note as an OpenNoteDeposit. Repeat until the budget is spent or the plan expires.",
  },
];

export default function Home() {
  return (
    <div>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="px-[clamp(20px,5vw,72px)] pt-[clamp(56px,10vh,120px)] pb-[clamp(64px,10vh,120px)]">
        <div className="mx-auto max-w-[1280px]">
          <div className="reveal">
            <p className="eyebrow">
              <b>◢</b> STRK20 · Starknet mainnet
            </p>

            <h1 className="display display-hero mt-6 text-[clamp(38px,8.4vw,104px)] max-w-[19ch]">
              Orders that keep their word.
            </h1>

            <div className="mt-10 grid lg:grid-cols-[1.05fr_0.95fr] gap-10 lg:gap-16 items-start">
              <p className="text-[clamp(15px,1.5vw,19px)] leading-[1.65] text-text-secondary max-w-[54ch]">
                A private limit order is a promise about the future, and on a public book it is also
                an advertisement. GhostBook moves the promise into a Cairo contract: commit the terms
                once, then fill them slice by slice through Ekubo — each fill a single private
                transaction settling into STRK20 notes.
              </p>

              <div className="grid grid-cols-3 gap-px bg-border border border-border">
                <Metric label="Enforced" value="6" note="plan terms, on-chain" />
                <Metric label="Venue" value="Ekubo" note="existing liquidity" />
                <Metric label="Tests" value="19" note="snforge, passing" />
              </div>
            </div>

            <div className="mt-11 flex flex-wrap items-center gap-3">
              <Link href="/orders" className="btn btn-orange">
                Open orders →
              </Link>
              <Link href="/private" className="btn btn-ghost">
                Shield a balance ↓
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Mechanism ────────────────────────────────────────────────────── */}
      <section className="px-[clamp(20px,5vw,72px)] py-[clamp(64px,10vh,130px)] border-t border-border">
        <div className="mx-auto max-w-[1280px]">
          <p className="eyebrow">
            <b>◢</b> How a fill works
          </p>
          <h2 className="display mt-5 text-[clamp(26px,3.4vw,48px)] max-w-[24ch]">
            Delegatable, without trust.
          </h2>
          <p className="mt-5 max-w-[62ch] text-[14px] leading-relaxed text-text-secondary">
            The privacy pool has no scheduler, so somebody has to trigger each slice. Committing the
            terms on-chain means that somebody can be anyone: they can only ever execute inside the
            plan you signed off on.
          </p>

          <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {MECHANISM.map((step) => (
              <article key={step.n} className="panel panel-lift p-6 pt-8 min-h-[228px]">
                <span className="ghost-numeral" aria-hidden>
                  {step.n}
                </span>
                <p className="tag relative z-10">Step {step.n}</p>
                <h3 className="relative z-10 mt-3 text-[17px] font-medium leading-snug">
                  {step.title}
                </h3>
                <p className="relative z-10 mt-3 text-[13px] leading-relaxed text-text-secondary">
                  {step.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── Enforced terms ───────────────────────────────────────────────── */}
      <section className="px-[clamp(20px,5vw,72px)] py-[clamp(64px,10vh,130px)] border-t border-border">
        <div className="mx-auto max-w-[1280px] grid lg:grid-cols-[0.85fr_1.15fr] gap-12">
          <div>
            <p className="eyebrow">
              <b>◢</b> The plan
            </p>
            <h2 className="display mt-5 text-[clamp(26px,3.4vw,44px)] max-w-[16ch]">
              Six terms, checked every fill.
            </h2>
            <p className="mt-5 text-[14px] leading-relaxed text-text-secondary max-w-[46ch]">
              State is keyed by the hash of the exact terms, so a plan cannot be edited mid-flight:
              change any field and you get a different key, leaving the original budget untouched.
            </p>
          </div>

          <div className="border border-border divide-y divide-border">
            <TermRow code="limit_num / limit_den" body="output ≥ amount_in × limit — your price" />
            <TermRow code="max_slice" body="maximum input per fill" />
            <TermRow code="total_amount" body="maximum cumulative input across fills" />
            <TermRow code="min_interval" body="minimum seconds between fills — TWAP pacing" />
            <TermRow code="expiry" body="no fill after this timestamp" />
            <TermRow code="salt" body="your secret — keeps the plan key unlinkable" />
          </div>
        </div>
      </section>

      {/* ── Privacy scope ────────────────────────────────────────────────── */}
      <section className="px-[clamp(20px,5vw,72px)] py-[clamp(64px,10vh,130px)] border-t border-border">
        <div className="mx-auto max-w-[1280px]">
          <p className="eyebrow">
            <b>◢</b> Privacy, stated precisely
          </p>
          <h2 className="display mt-5 text-[clamp(26px,3.4vw,44px)] max-w-[22ch]">
            Identity privacy. <span className="text-primary">Not amount privacy.</span>
          </h2>

          <div className="mt-11 grid md:grid-cols-2 gap-4">
            <div className="panel-accent p-7">
              <p className="tag">[ Private ]</p>
              <ul className="mt-5 space-y-3 text-[13px] leading-relaxed text-text-secondary">
                <ScopeItem>Who is trading — the pool is the counterparty and fills are relayed</ScopeItem>
                <ScopeItem>Note-to-note transfers: no amount, no parties</ScopeItem>
                <ScopeItem>Which deposit a withdrawal came from</ScopeItem>
                <ScopeItem>The plan itself — only its hash is stored</ScopeItem>
              </ul>
            </div>
            <div className="panel-flat p-7">
              <p className="tag">[ Public ]</p>
              <ul className="mt-5 space-y-3 text-[13px] leading-relaxed text-text-secondary">
                <ScopeItem>Each slice&apos;s Ekubo swap: pool, amounts, timing</ScopeItem>
                <ScopeItem>Shielding: your address, the token, the amount</ScopeItem>
                <ScopeItem>Withdrawal destination and amount</ScopeItem>
                <ScopeItem>Every fill&apos;s SliceFilled event, under the salted plan hash</ScopeItem>
              </ul>
            </div>
          </div>

          <p className="mt-6 text-[12px] leading-relaxed text-text-tertiary max-w-[80ch]">
            Slicing weakens amount correlation; it does not hide the swap. A distinctive amount
            executed shortly after a distinctive deposit is still correlatable, and an observer
            watching one plan hash can bound its limit price and pacing from the fills themselves.
          </p>
        </div>
      </section>

      {/* ── Contracts ────────────────────────────────────────────────────── */}
      <section className="px-[clamp(20px,5vw,72px)] py-[clamp(64px,10vh,120px)] border-t border-border">
        <div className="mx-auto max-w-[1280px]">
          <p className="eyebrow">
            <b>◢</b> Mainnet
          </p>
          <h2 className="display mt-5 text-[clamp(24px,2.6vw,36px)]">Contracts</h2>

          <div className="mt-8 border border-border divide-y divide-border">
            <AddressRow label="STRK20 privacy pool" address={MAINNET.privacyPool} />
            <AddressRow label="Ekubo router" address={MAINNET.ekuboRouter} />
            {MAINNET.anonymizer ? (
              <AddressRow label="GhostBook anonymizer" address={MAINNET.anonymizer} />
            ) : (
              <div className="flex items-center justify-between gap-4 px-5 py-4">
                <span className="label">GhostBook anonymizer</span>
                <span className="mono text-[11px] text-warning tracking-[0.12em] uppercase">
                  Not deployed yet
                </span>
              </div>
            )}
          </div>

          <p className="mt-10 mono text-[10px] tracking-[0.22em] uppercase text-text-ghost">
            Cairo · Scarb + snforge · Next.js · MIT
          </p>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="bg-background px-4 py-5">
      <p className="label">{label}</p>
      <p className="display mt-2.5 text-[clamp(22px,2.4vw,34px)]">{value}</p>
      <p className="mt-1.5 text-[11px] leading-snug text-text-tertiary">{note}</p>
    </div>
  );
}

function TermRow({ code, body }: { code: string; body: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-6 px-5 py-4">
      <code className="mono text-[12px] text-primary shrink-0 sm:w-[200px]">{code}</code>
      <span className="text-[13px] text-text-secondary leading-relaxed">{body}</span>
    </div>
  );
}

function ScopeItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="text-primary mt-[2px] shrink-0" aria-hidden>
        ◢
      </span>
      <span>{children}</span>
    </li>
  );
}

function AddressRow({ label, address }: { label: string; address: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-6 px-5 py-4">
      <span className="label shrink-0">{label}</span>
      <a
        href={explorerContractUrl(MAINNET, address)}
        target="_blank"
        rel="noreferrer"
        className="mono text-[11px] text-text-secondary hover:text-primary transition-colors truncate"
      >
        {address} ↗
      </a>
    </div>
  );
}
