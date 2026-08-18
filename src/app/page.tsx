"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ArrowRight, Clock, Eye, Lock, ShieldCheck, Split } from "lucide-react";
import GhostLogo from "@/components/GhostLogo";
import ConnectButton from "@/components/wallet/ConnectButton";
import { useWallet } from "@/context/WalletContext";
import { MAINNET, explorerContractUrl } from "@/lib/starknet/config";

const FEATURES = [
  {
    icon: Lock,
    title: "Terms committed once",
    body: "A plan fixes the limit price, slice size, total budget, pacing and expiry. The anonymizer stores only poseidon(plan), so the terms authenticate themselves on every fill.",
  },
  {
    icon: Split,
    title: "Sliced execution",
    body: "Fill a large order as a series of small private transactions. Each slice is capped and paced by the plan, which breaks the amount correlation a single swap would leak.",
  },
  {
    icon: ShieldCheck,
    title: "Safe to delegate",
    body: "Whoever assembles the fill can only ever execute inside the committed terms — wrong price, too big, too soon or too late all revert. Output lands in your private note.",
  },
  {
    icon: Clock,
    title: "Real liquidity",
    body: "Fills route through Ekubo on Starknet mainnet, inside one atomic private transaction. No wrapped venue, no bespoke AMM, no fragmented liquidity.",
  },
];

export default function Home() {
  const { isConnected } = useWallet();

  return (
    <div className="relative overflow-hidden">
      <Image
        src="/ghost.png"
        alt=""
        width={420}
        height={420}
        className="pointer-events-none absolute -right-24 top-24 opacity-[0.07] rotate-12 hidden sm:block"
        aria-hidden
      />
      <Image
        src="/ghost.png"
        alt=""
        width={280}
        height={280}
        className="pointer-events-none absolute -left-20 top-[520px] opacity-[0.06] -rotate-12 hidden lg:block"
        aria-hidden
      />

      <section className="relative px-4 pt-20 sm:pt-28 pb-16 max-w-5xl mx-auto text-center">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
          <GhostLogo size={72} priority className="w-16 h-16 sm:w-[72px] sm:h-[72px] mx-auto mb-6" />

          <p className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface border border-border text-[11px] text-text-secondary mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            STRK20 · Starknet mainnet
          </p>

          <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight leading-[1.05]">
            Private limit orders
            <br />
            that keep their word
          </h1>

          <p className="mt-5 text-[15px] sm:text-lg text-text-secondary max-w-2xl mx-auto leading-relaxed">
            GhostBook turns a resting order into terms enforced by a Cairo contract: commit a limit
            price and a schedule once, then fill it slice by slice through Ekubo — each fill a single
            private transaction settling into STRK20 notes.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/orders"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary hover:bg-primary-hover text-white font-semibold transition-colors"
            >
              Open orders <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/private"
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-surface border border-border hover:bg-surface-2 font-semibold transition-colors"
            >
              Shield a balance
            </Link>
            {!isConnected ? <ConnectButton /> : null}
          </div>
        </motion.div>
      </section>

      <section className="relative px-4 pb-20 max-w-5xl mx-auto">
        <div className="grid sm:grid-cols-2 gap-3">
          {FEATURES.map(({ icon: Icon, title, body }, index) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.06 }}
              className="rounded-2xl bg-surface border border-border p-5"
            >
              <Icon className="w-5 h-5 text-primary mb-3" />
              <h2 className="text-[15px] font-semibold">{title}</h2>
              <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">{body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="relative px-4 pb-20 max-w-3xl mx-auto">
        <div className="rounded-2xl bg-surface border border-border p-5 sm:p-6">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Eye className="w-4 h-4 text-primary" /> What is and isn&apos;t private
          </h2>
          <div className="mt-4 grid sm:grid-cols-2 gap-4 text-[12px] leading-relaxed">
            <div>
              <p className="text-text-secondary uppercase tracking-wide text-[10px] mb-1.5">
                Private
              </p>
              <ul className="space-y-1.5">
                <li>Who is trading — the pool is the swap counterparty, not you</li>
                <li>Note-to-note transfers: no amount, no parties</li>
                <li>Which deposit a withdrawal came from</li>
                <li>The parent order&apos;s limit price and schedule</li>
              </ul>
            </div>
            <div>
              <p className="text-text-secondary uppercase tracking-wide text-[10px] mb-1.5">
                Public
              </p>
              <ul className="space-y-1.5">
                <li>Deposits: your address, the token and the amount</li>
                <li>Withdrawal destination and amount</li>
                <li>Each slice&apos;s swap amounts and timing on Ekubo</li>
              </ul>
            </div>
          </div>
          <p className="mt-4 text-[11px] text-text-tertiary">
            GhostBook claims identity privacy, not amount privacy. A distinctive amount executed
            shortly after a distinctive deposit is still correlatable.
          </p>
        </div>
      </section>

      <section className="relative px-4 pb-24 max-w-3xl mx-auto">
        <h2 className="text-sm font-semibold mb-3">Mainnet contracts</h2>
        <div className="rounded-2xl bg-surface border border-border divide-y divide-border text-[12px]">
          <Row label="STRK20 privacy pool" address={MAINNET.privacyPool} />
          <Row label="Ekubo router" address={MAINNET.ekuboRouter} />
          {MAINNET.anonymizer ? (
            <Row label="GhostBook anonymizer" address={MAINNET.anonymizer} />
          ) : (
            <div className="px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-text-secondary">GhostBook anonymizer</span>
              <span className="text-warning">not deployed yet</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Row({ label, address }: { label: string; address: string }) {
  return (
    <div className="px-4 py-3 flex items-center justify-between gap-3">
      <span className="text-text-secondary shrink-0">{label}</span>
      <a
        href={explorerContractUrl(MAINNET, address)}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-primary hover:underline truncate"
      >
        {address}
      </a>
    </div>
  );
}
