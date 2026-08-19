"use client";

import { ArrowLeftRight, Shield, Lock, Eye, ArrowRight, Zap, BookOpen } from "lucide-react";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import GhostLogo from "@/components/GhostLogo";
import { MAINNET, explorerContractUrl } from "@/lib/starknet/config";
import { ghostHeight } from "@/components/ghostArt";

const features = [
  {
    icon: Lock,
    title: "Private balance",
    description:
      "Shield ERC-20s into the STRK20 privacy pool. Note-to-note sends carry no amount and no parties on-chain.",
  },
  {
    icon: Shield,
    title: "Committed terms",
    description:
      "Price, slice size, pacing, budget and expiry are committed as one hash. A Cairo anonymizer re-checks all of them on every fill.",
  },
  {
    icon: Eye,
    title: "Reverts, not slippage",
    description:
      "Below your price, too large, too soon, past expiry — any of those aborts the whole transaction. Nothing leaves the pool.",
  },
  {
    icon: ArrowLeftRight,
    title: "Filled through Ekubo",
    description:
      "Slices route through existing Ekubo liquidity, then settle straight back into your private balance as a new note.",
  },
];

const floaters = [
  { top: "4%", left: "2%", size: 180, rotate: -14, opacity: 0.16, delay: 0 },
  { top: "12%", right: "2%", size: 260, rotate: 16, opacity: 0.2, delay: 0.4 },
  { top: "48%", left: "0%", size: 160, rotate: 10, opacity: 0.12, delay: 0.8 },
  { top: "62%", right: "1%", size: 220, rotate: -18, opacity: 0.15, delay: 1.1 },
  { top: "32%", left: "38%", size: 120, rotate: 6, opacity: 0.08, delay: 0.2 },
];

const PRIVATE = [
  "Who is trading — the pool is the counterparty and fills are relayed",
  "Note-to-note transfers: no amount, no parties",
  "Which deposit a withdrawal came from",
  "Your order's terms — only a fingerprint of them is stored",
];

const PUBLIC = [
  "Each fill's swap on Ekubo: pool, amounts, timing",
  "Shielding: your address, the token, the amount",
  "Withdrawal destination and amount",
  "That some order made a fill, under its anonymous id",
];

export default function Home() {
  return (
    <div className="relative bg-black text-white overflow-hidden">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[700px] rounded-full bg-[#b8ff30]/[0.07] blur-[160px]" />
        <div className="absolute top-[55%] -right-40 w-[600px] h-[600px] rounded-full bg-white/[0.03] blur-[120px]" />
        {floaters.map((f, i) => (
          <motion.div
            key={i}
            className="absolute"
            style={{
              top: f.top,
              left: "left" in f ? f.left : undefined,
              right: "right" in f ? f.right : undefined,
              opacity: f.opacity,
              rotate: f.rotate,
            }}
            animate={{ y: [0, -22, 0] }}
            transition={{
              duration: 5.5 + i,
              repeat: Infinity,
              ease: "easeInOut",
              delay: f.delay,
            }}
          >
            <Image
              src="/ghost.png"
              alt=""
              width={f.size}
              height={ghostHeight(f.size)}
              className="select-none"
              aria-hidden
            />
          </motion.div>
        ))}
      </div>

      <section className="relative max-w-[1200px] mx-auto px-4 sm:px-6 pt-16 sm:pt-20 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.88 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.6 }}
          className="flex justify-center mb-6 sm:mb-8"
        >
          <GhostLogo
            size={320}
            priority
            className="w-[200px] h-[200px] sm:w-[280px] sm:h-[280px] md:w-[340px] md:h-[340px] drop-shadow-[0_0_48px_rgba(184,255,48,0.4)]"
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="text-center max-w-[720px] mx-auto"
        >
          <p className="text-sm sm:text-base font-semibold tracking-[0.22em] uppercase text-[#b8ff30] mb-4">
            GhostBook
          </p>
          <h1 className="text-[clamp(2.5rem,6.5vw,4.75rem)] font-bold leading-[1.05] tracking-tight mb-5">
            Private orders on{" "}
            <span className="text-[#b8ff30]">Starknet</span>
          </h1>
          <p className="text-lg sm:text-xl text-zinc-300 max-w-[560px] mx-auto mb-10 leading-relaxed">
            A limit order on a public book is an advertisement. GhostBook commits your terms to a
            Cairo contract instead, then fills them slice by slice through Ekubo — each fill a single
            private transaction settling into STRK20 notes.
          </p>
          <div className="w-full max-w-xs sm:max-w-none sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
            <Link
              href="/orders"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl text-base font-semibold bg-white text-black hover:bg-white/90 transition-colors"
            >
              Open Orders <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/balance"
              className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl text-base font-medium bg-black border border-white/20 text-white hover:bg-white/5 transition-colors"
            >
              Private Balance
            </Link>
          </div>
        </motion.div>
      </section>

      <section className="relative max-w-[1200px] mx-auto px-4 sm:px-6 pb-24">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
                className="relative p-6 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-[#b8ff30]/40 transition-colors group overflow-hidden"
              >
                {i % 2 === 0 && (
                  <Image
                    src="/ghost.png"
                    alt=""
                    width={120}
                    height={ghostHeight(120)}
                    className="pointer-events-none absolute -right-3 -bottom-4 opacity-[0.1] rotate-12 group-hover:opacity-[0.18] transition-opacity"
                    aria-hidden
                  />
                )}
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-[15px] font-semibold mb-1.5">{f.title}</h3>
                <p className="text-sm text-zinc-300 leading-relaxed">{f.description}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      <section className="relative max-w-[1200px] mx-auto px-4 sm:px-6 pb-24">
        <div className="text-center mb-12">
          <GhostLogo size={96} className="w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-5 opacity-90" />
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">How a fill works</h2>
          <p className="text-zinc-300 max-w-xl mx-auto">
            The privacy pool has no scheduler, so somebody has to trigger each slice. Committing the
            terms on-chain means that somebody can be anyone.
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-6 max-w-[900px] mx-auto">
          {[
            {
              n: "1",
              title: "Commit the plan",
              desc: "Price, amount, slice size, pacing and expiry are hashed with your secret salt. Only the hash goes on-chain — never the terms.",
              icon: Lock,
            },
            {
              n: "2",
              title: "Fill a slice",
              desc: "One private transaction moves a chunk out of the pool, swaps it on Ekubo, and routes the output straight back in.",
              icon: Zap,
            },
            {
              n: "3",
              title: "Terms hold, or it reverts",
              desc: "The anonymizer re-derives the hash and re-checks every term. If one fails, the whole transaction aborts and nothing left the pool.",
              icon: Shield,
            },
          ].map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.n}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="text-center p-6"
              >
                <div className="w-12 h-12 rounded-2xl bg-black border border-white/10 flex items-center justify-center mx-auto mb-4">
                  <Icon className="w-5 h-5 text-[#b8ff30]" />
                </div>
                <div className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
                  Step {s.n}
                </div>
                <h3 className="text-lg font-semibold mb-2">{s.title}</h3>
                <p className="text-sm text-zinc-300 leading-relaxed">{s.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Privacy scope — stated precisely, because overclaiming here is the expensive kind of wrong. */}
      <section className="relative max-w-[900px] mx-auto px-4 sm:px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="rounded-3xl bg-white/[0.04] border border-white/10 p-8 sm:p-10"
        >
          <div className="flex items-center gap-3 mb-2">
            <BookOpen className="w-5 h-5 text-[#b8ff30]" />
            <h2 className="text-xl sm:text-2xl font-bold">
              Identity privacy, not amount privacy
            </h2>
          </div>
          <p className="text-sm text-zinc-400 mb-6">
            What the pool hides, and what it cannot.
          </p>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-[#b8ff30]/[0.06] border border-[#b8ff30]/20 p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-[#b8ff30] mb-3">
                Private
              </p>
              <ul className="space-y-2.5 text-sm text-zinc-300 leading-relaxed">
                {PRIVATE.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-[#b8ff30] shrink-0" aria-hidden>
                      ·
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
                Public
              </p>
              <ul className="space-y-2.5 text-sm text-zinc-300 leading-relaxed">
                {PUBLIC.map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-zinc-500 shrink-0" aria-hidden>
                      ·
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="mt-6 text-xs text-zinc-500 leading-relaxed">
            Slicing weakens amount correlation; it does not hide the swap. A distinctive amount
            executed shortly after a distinctive deposit is still correlatable, and an observer
            watching one plan hash can bound its limit price and pacing from the fills themselves.
          </p>
        </motion.div>
      </section>

      {/* Mainnet contracts */}
      <section className="relative max-w-[900px] mx-auto px-4 sm:px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="rounded-3xl bg-white/[0.04] border border-white/10 p-8 sm:p-10"
        >
          <h2 className="text-xl sm:text-2xl font-bold mb-6">Starknet mainnet</h2>
          <div className="divide-y divide-white/10">
            <AddressRow label="STRK20 privacy pool" address={MAINNET.privacyPool} />
            <AddressRow label="Ekubo router" address={MAINNET.ekuboRouter} />
            {MAINNET.anonymizer ? (
              <AddressRow label="GhostBook anonymizer" address={MAINNET.anonymizer} />
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-6 py-3.5">
                <span className="text-sm text-zinc-400">GhostBook anonymizer</span>
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                  Not deployed yet
                </span>
              </div>
            )}
          </div>
        </motion.div>
      </section>

      <section className="relative max-w-[1200px] mx-auto px-4 sm:px-6 pb-24">
        <div className="relative rounded-3xl bg-white text-black border border-white/20 p-10 sm:p-16 text-center overflow-hidden">
          <Image
            src="/ghost.png"
            alt=""
            width={280}
            height={ghostHeight(280)}
            className="pointer-events-none absolute -left-10 -bottom-12 opacity-[0.14] -rotate-12"
            aria-hidden
          />
          <Image
            src="/ghost.png"
            alt=""
            width={220}
            height={ghostHeight(220)}
            className="pointer-events-none absolute -right-8 top-0 opacity-[0.12] rotate-12"
            aria-hidden
          />
          <GhostLogo size={120} className="w-24 h-24 sm:w-28 sm:h-28 mx-auto mb-6 relative" />
          <h2 className="text-2xl sm:text-3xl font-bold mb-3 relative">Ready to try GhostBook?</h2>
          <p className="text-zinc-700 mb-8 max-w-md mx-auto relative">
            Shield what you want to trade, commit a price, then fill it slice by slice on Starknet
            mainnet.
          </p>
          <Link
            href="/balance"
            className="relative inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-base font-semibold bg-black text-white hover:bg-black/90 transition-colors"
          >
            Open Private Balance <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/10 py-8">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-zinc-400 text-sm">
            <GhostLogo size={28} className="w-7 h-7" alt="" /> GhostBook · Starknet STRK20
          </div>
          <div className="flex items-center gap-6 text-sm text-zinc-400">
            <a
              href="https://strk20.starknet.io"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              STRK20
            </a>
            <a
              href="https://ekubo.org"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              Ekubo
            </a>
            <a
              href="https://voyager.online"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              Explorer
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

function AddressRow({ label, address }: { label: string; address: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-6 py-3.5">
      <span className="text-sm text-zinc-400 shrink-0">{label}</span>
      <a
        href={explorerContractUrl(MAINNET, address)}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-xs text-zinc-300 hover:text-[#b8ff30] transition-colors truncate"
      >
        {address}
      </a>
    </div>
  );
}
