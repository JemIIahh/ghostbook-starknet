"use client";

import { ArrowLeftRight, Shield, Lock, Eye, ArrowRight, Zap, BookOpen } from "lucide-react";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useWallet } from "@/context/WalletContext";
import GhostLogo from "@/components/GhostLogo";
import FaucetButton from "@/components/FaucetButton";

const features = [
  {
    icon: Lock,
    title: "Private Swap",
    description:
      "Encrypt swap intent to the TEE, escrow on PrivacyRouter, match privately, settle with an attested signature.",
  },
  {
    icon: Shield,
    title: "TEE Vault",
    description:
      "CipherSign on Flare Confidential Compute. Policies (allowlist, cap, expiry) are enforced inside the enclave — not in a public contract.",
  },
  {
    icon: Eye,
    title: "Sealed Until Fill",
    description:
      "tokenOut / minOut stay ciphertext until TEE attestation. Settlement routes through Uniswap — amounts become public only at fill.",
  },
  {
    icon: ArrowLeftRight,
    title: "Onchain Settlement",
    description:
      "Uniswap V3–style pools on Coston2 settle trades and liquidity. The DEX stays composable; TEE protects sealed intents and operator keys.",
  },
];

const floaters = [
  { top: "4%", left: "2%", size: 180, rotate: -14, opacity: 0.16, delay: 0 },
  { top: "12%", right: "2%", size: 260, rotate: 16, opacity: 0.2, delay: 0.4 },
  { top: "48%", left: "0%", size: 160, rotate: 10, opacity: 0.12, delay: 0.8 },
  { top: "62%", right: "1%", size: 220, rotate: -18, opacity: 0.15, delay: 1.1 },
  { top: "32%", left: "38%", size: 120, rotate: 6, opacity: 0.08, delay: 0.2 },
];

export default function Home() {
  const { isConnected, connect } = useWallet();

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
              height={f.size}
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
            Confidential trading with{" "}
            <span className="text-[#b8ff30]">Flare TEEs</span>
          </h1>
          <p className="text-lg sm:text-xl text-zinc-300 max-w-[560px] mx-auto mb-10 leading-relaxed">
            Sensitive order and payout logic runs inside a Trusted Execution Environment.
            Verified outputs connect back to onchain settlement on Coston2.
          </p>
            <div className="w-full max-w-xs sm:max-w-none sm:w-auto flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
              {isConnected ? (
                <Link
                  href="/privacy"
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl text-base font-semibold bg-white text-black hover:bg-white/90 transition-colors"
                >
                  TEE Swap <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <button
                  onClick={connect}
                  className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl text-base font-semibold bg-white text-black hover:bg-white/90 transition-colors"
                >
                  Get Started <ArrowRight className="w-4 h-4" />
                </button>
              )}
            
              <Link
                href="/orders"
                className="inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-2xl text-base font-medium bg-black border border-white/20 text-white hover:bg-white/5 transition-colors"
              >
                TEE Orders
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
                    height={120}
                    className="pointer-events-none absolute -right-3 -bottom-4 opacity-[0.1] rotate-12 group-hover:opacity-[0.18] transition-opacity"
                    aria-hidden
                  />
                )}
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="text-[15px] font-semibold mb-1.5 group-hover:text-white transition-colors">
                  {f.title}
                </h3>
                <p className="text-sm text-zinc-300 leading-relaxed">{f.description}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      <section className="relative max-w-[1200px] mx-auto px-4 sm:px-6 pb-24">
        <div className="text-center mb-12">
          <GhostLogo size={96} className="w-20 h-20 sm:w-24 sm:h-24 mx-auto mb-5 opacity-90" />
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">How TEE + onchain fit together</h2>
          <p className="text-zinc-300 max-w-xl mx-auto">
            Private execution where it matters — settlement where it must be public.
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-6 max-w-[900px] mx-auto">
          {[
            {
              n: "1",
              title: "Private in the TEE",
              desc: "CipherSign enforces allowlist, amount caps, and expiry inside Flare FCC. Sealed order details stay hidden until reveal.",
              icon: Lock,
            },
            {
              n: "2",
              title: "Verified output",
              desc: "The enclave returns an attested signature or policy decision — not your raw private key or unconstrained signing power.",
              icon: Shield,
            },
            {
              n: "3",
              title: "Consumed onchain",
              desc: "Swaps and LP settle on Uniswap V3–style pools on Coston2. TEE outputs unlock operator payouts and confidential workflows.",
              icon: Zap,
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

      <section className="relative max-w-[900px] mx-auto px-4 sm:px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="rounded-3xl bg-white/[0.04] border border-white/10 p-8 sm:p-10"
        >
          <div className="flex items-center gap-3 mb-4">
            <BookOpen className="w-5 h-5 text-[#b8ff30]" />
            <h2 className="text-xl sm:text-2xl font-bold">Why confidential compute</h2>
          </div>
          <div className="space-y-4 text-sm sm:text-base text-zinc-300 leading-relaxed">
            <p>
              <span className="text-foreground font-medium">Inside the TEE:</span> policy checks
              and signing keys for operator payouts (CipherSign), plus sealed order intent handling
              so price and size are not broadcast by default.
            </p>
            <p>
              <span className="text-foreground font-medium">Onchain:</span> pool state, swaps, and
              liquidity remain public and composable on Coston2 — where settlement and auditability
              belong.
            </p>
            <p>
              <span className="text-foreground font-medium">Trust assumptions:</span> you trust
              Flare FCC hardware attestation and the CipherSign enclave code path — not a
              centralized hot wallet that can sign anything. That is why TEE beats plain smart
              contracts for secrets that must never live in public calldata.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/vault"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-[#b8ff30] text-black hover:bg-[#b8ff30]/90 transition-colors"
            >
              Explore Vault
            </Link>
            <Link
              href="/orders"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium border border-white/20 hover:bg-white/5 transition-colors"
            >
              Explore Orders
            </Link>
          </div>
        </motion.div>
      </section>

      <section className="relative max-w-[1200px] mx-auto px-4 sm:px-6 pb-24">
        <div className="relative rounded-3xl bg-white text-black border border-white/20 p-10 sm:p-16 text-center overflow-hidden">
          <Image
            src="/ghost.png"
            alt=""
            width={280}
            height={280}
            className="pointer-events-none absolute -left-10 -bottom-12 opacity-[0.14] -rotate-12"
            aria-hidden
          />
          <Image
            src="/ghost.png"
            alt=""
            width={220}
            height={220}
            className="pointer-events-none absolute -right-8 top-0 opacity-[0.12] rotate-16"
            aria-hidden
          />
          <GhostLogo size={120} className="w-24 h-24 sm:w-28 sm:h-28 mx-auto mb-6 relative" />
          <h2 className="text-2xl sm:text-3xl font-bold mb-3 relative">Ready to try GhostBook?</h2>
          <p className="text-zinc-700 mb-8 max-w-md mx-auto relative">
            Connect on Flare Coston2 — seal orders, settle on the DEX, and gate payouts with TEE policy.
          </p>
          {isConnected ? (
            <Link
              href="/vault"
              className="relative inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-base font-semibold bg-black text-white hover:bg-black/90 transition-colors"
            >
              Open TEE Vault <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <button
              onClick={connect}
              className="relative inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl text-base font-semibold bg-black text-white hover:bg-black/90 transition-colors"
            >
              Connect Wallet <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </section>

      <footer className="border-t border-white/10 py-8">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-zinc-400 text-sm">
            <GhostLogo size={28} className="w-7 h-7" alt="" /> GhostBook · Flare TEE
          </div>
          <div className="flex items-center gap-6 text-sm text-zinc-400">
            <a
              href="https://dev.flare.network"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              Flare Docs
            </a>
            <a
              href="https://faucet.flare.network/coston2"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              Faucet
            </a>
            <a
              href="https://coston2-explorer.flare.network"
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
