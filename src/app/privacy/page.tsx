"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowDown,
  ChevronDown,
  ExternalLink,
  Lock,
  Settings,
  Shield,
  X,
} from "lucide-react";
import { ethers } from "ethers";
import { getBrowserProvider, getCoston2RpcProvider, BALANCES_CHANGED_EVENT } from "@/lib/ethereum";
import { useWallet } from "@/context/WalletContext";
import { UNISWAP_CONFIG, UNISWAP_TOKENS, type UniswapToken } from "@/lib/uniswapConfig";
import { ERC20_ABI, QUOTER_ABI } from "@/lib/uniswapAbis";
import { getExplorerTxUrl } from "@/lib/constants";
import { formatAmount } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import GhostPageShell from "@/components/GhostPageShell";
import GhostLoader from "@/components/GhostLoader";
import TokenIcon from "@/components/TokenIcon";
import { useToast } from "@/context/ToastContext";
import {
  encryptIntentToPubkey,
  PRIVACY_ROUTER_ABI,
  type SealedSwapIntent,
} from "@/lib/privacy";

type TeeInfo = {
  configured: boolean;
  address?: string;
  publicKey?: string;
  privacyRouter?: string | null;
};

type Step = "idle" | "approve" | "escrow" | "match" | "settle" | "done";

export default function PrivacySwapPage() {
  const { isConnected, connect, address } = useWallet();
  const { showSuccess, showError, showInfo } = useToast();

  const [tokenIn, setTokenIn] = useState<UniswapToken>(UNISWAP_TOKENS[0]);
  const [tokenOut, setTokenOut] = useState<UniswapToken>(UNISWAP_TOKENS[1]);
  const [amountIn, setAmountIn] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [showSettings, setShowSettings] = useState(false);
  const [fee] = useState(3000);
  const [selectingFor, setSelectingFor] = useState<"in" | "out" | null>(null);
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [decimals, setDecimals] = useState<Record<string, number>>({});
  const [quotedOut, setQuotedOut] = useState<string | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);

  const [teeInfo, setTeeInfo] = useState<TeeInfo | null>(null);
  const [step, setStep] = useState<Step>("idle");
  const [busy, setBusy] = useState(false);
  const [intentId, setIntentId] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusBody, setStatusBody] = useState(
    "Encrypt intent → escrow on PrivacyRouter → TEE match → attested settle."
  );

  const routerAddress =
    teeInfo?.privacyRouter ||
    process.env.NEXT_PUBLIC_PRIVACY_ROUTER ||
    UNISWAP_CONFIG.privacyRouter ||
    "";

  const loadMeta = async (token: UniswapToken) => {
    if (decimals[token.address] != null) return decimals[token.address];
    const provider = getCoston2RpcProvider();
    const c = new ethers.Contract(token.address, ERC20_ABI, provider);
    const d = Number(await c.decimals());
    setDecimals((p) => ({ ...p, [token.address]: d }));
    return d;
  };

  const refreshBalances = async () => {
    if (!address) return;
    try {
      // Always read from Coston2 RPC — MetaMask on the wrong chain would show 0.
      const provider = getCoston2RpcProvider();
      const results: Record<string, string> = {};
      for (const t of [tokenIn, tokenOut]) {
        const d = await loadMeta(t);
        const c = new ethers.Contract(t.address, ERC20_ABI, provider);
        results[t.address] = ethers.formatUnits(await c.balanceOf(address), d);
      }
      setBalances(results);
    } catch (err) {
      console.error("Failed to fetch balances", err);
    }
  };

  useEffect(() => {
    fetch("/api/privacy/info")
      .then(async (r) => {
        const j = (await r.json()) as TeeInfo & { error?: string };
        setTeeInfo(j);
      })
      .catch(() => setTeeInfo({ configured: false }));
  }, []);

  useEffect(() => {
    if (isConnected && address) refreshBalances();
  }, [isConnected, address, tokenIn.address, tokenOut.address]);

  useEffect(() => {
    const onBal = () => {
      if (isConnected && address) refreshBalances();
    };
    window.addEventListener(BALANCES_CHANGED_EVENT, onBal);
    return () => window.removeEventListener(BALANCES_CHANGED_EVENT, onBal);
  }, [isConnected, address, tokenIn.address, tokenOut.address]);

  useEffect(() => {
    let mounted = true;
    const timer = setTimeout(async () => {
      if (!amountIn || !isConnected || !window.ethereum) {
        setQuotedOut(null);
        return;
      }
      setIsQuoting(true);
      try {
        const provider = getCoston2RpcProvider();
        const dIn = await loadMeta(tokenIn);
        const dOut = await loadMeta(tokenOut);
        const amountParsed = ethers.parseUnits(amountIn, dIn);
        const quoter = new ethers.Contract(
          UNISWAP_CONFIG.quoterAddress,
          QUOTER_ABI,
          provider
        );
        const result = await quoter.quoteSingle.staticCall({
          tokenIn: tokenIn.address,
          tokenOut: tokenOut.address,
          fee,
          amountIn: amountParsed,
          sqrtPriceLimitX96: 0n,
        });
        const out = BigInt(result[0] ?? result);
        if (mounted) setQuotedOut(ethers.formatUnits(out, dOut));
      } catch {
        if (mounted) setQuotedOut(null);
      } finally {
        if (mounted) setIsQuoting(false);
      }
    }, 400);
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [amountIn, tokenIn.address, tokenOut.address, fee, isConnected]);

  const flipTokens = () => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn("");
    setQuotedOut(null);
  };

  const runPrivateSwap = async () => {
    setError(null);
    setTxHash(null);
    if (!isConnected || !address) {
      connect();
      return;
    }
    if (!amountIn || Number(amountIn) <= 0) return;
    if (!teeInfo?.configured || !teeInfo.publicKey) {
      showError("Privacy TEE offline — set PRIVACY_TEE_PRIVATE_KEY in .env.local");
      return;
    }
    if (!routerAddress) {
      showError("Deploy PrivacyRouter and set privacyRouter / NEXT_PUBLIC_PRIVACY_ROUTER");
      return;
    }

    setBusy(true);
    try {
      const provider = getBrowserProvider();
      const signer = await provider.getSigner();
      const dIn = await loadMeta(tokenIn);
      const dOut = await loadMeta(tokenOut);
      const amountParsed = ethers.parseUnits(amountIn, dIn);

      let minOut = 0n;
      if (quotedOut) {
        const raw = ethers.parseUnits(quotedOut, dOut);
        const bps = BigInt(Math.floor(Number(slippage) * 100));
        minOut = raw - (raw * bps) / 10_000n;
      }

      const deadline = Math.floor(Date.now() / 1000) + 3600;
      const salt = ethers.hexlify(ethers.randomBytes(16));
      const sealed: SealedSwapIntent = {
        version: 1,
        tokenIn: tokenIn.address as `0x${string}`,
        tokenOut: tokenOut.address as `0x${string}`,
        amountIn: amountParsed.toString(),
        amountOutMin: minOut.toString(),
        fee,
        recipient: address as `0x${string}`,
        deadline,
        salt,
      };

      setStep("approve");
      setStatusBody("Sealing intent with TEE pubkey (ECIES)…");
      const { commitment, packed } = await encryptIntentToPubkey(
        sealed,
        teeInfo.publicKey
      );

      const erc20 = new ethers.Contract(tokenIn.address, ERC20_ABI, signer);
      const router = new ethers.Contract(routerAddress, PRIVACY_ROUTER_ABI, signer);
      const allowance: bigint = await erc20.allowance(address, routerAddress);
      if (allowance < amountParsed) {
        setStatusBody(`Approve ${tokenIn.symbol} for PrivacyRouter…`);
        showInfo(`Approve ${tokenIn.symbol}`);
        const txA = await erc20.approve(routerAddress, ethers.MaxUint256);
        await txA.wait();
      }

      setStep("escrow");
      setStatusBody("Escrowing tokens + posting ciphertext on-chain…");
      const txSub = await router.submitIntent(
        tokenIn.address,
        amountParsed,
        commitment,
        packed,
        deadline
      );
      const receipt = await txSub.wait();
      setTxHash(receipt.hash);

      let id: string | null = null;
      for (const log of receipt.logs as ethers.Log[]) {
        try {
          const parsed = router.interface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          if (parsed?.name === "IntentSubmitted") {
            id = parsed.args.id.toString();
            break;
          }
        } catch {
          /* skip */
        }
      }
      if (!id) {
        const next = await router.nextIntentId();
        id = (BigInt(next) - 1n).toString();
      }
      setIntentId(id);
      showSuccess(`Sealed intent #${id} escrowed`);

      setStep("match");
      setStatusBody("TEE decrypting + matching privately…");
      const matchRes = await fetch("/api/privacy/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intentId: id }),
      });
      const matchJson = (await matchRes.json()) as {
        error?: string;
        teeSig?: string;
        tokenOut?: string;
        amountOutMin?: string;
        fee?: number;
        recipient?: string;
        quotedOut?: string;
      };
      if (!matchRes.ok || !matchJson.teeSig) {
        throw new Error(matchJson.error || "TEE match failed");
      }

      setStep("settle");
      setStatusBody("Submitting TEE-attested settlement…");
      const txSettle = await router.settle(
        id,
        matchJson.tokenOut,
        matchJson.amountOutMin,
        matchJson.fee,
        matchJson.recipient,
        matchJson.teeSig
      );
      const settleReceipt = await txSettle.wait();
      setTxHash(settleReceipt.hash);
      setStep("done");
      setStatusBody(
        `Settled privately. Quoted ~${formatAmount(
          matchJson.quotedOut ? ethers.formatUnits(matchJson.quotedOut, dOut) : null
        )} ${tokenOut.symbol}`
      );
      showSuccess(`Private swap settled · intent #${id}`);
      setAmountIn("");
      await refreshBalances();
    } catch (err: unknown) {
      const msg = friendlyError(err, "Private swap failed");
      setError(msg);
      showError(msg);
      setStep("idle");
      setStatusBody("Failed — fix the error and try again.");
    } finally {
      setBusy(false);
    }
  };

  const actionLabel = !isConnected
    ? "Connect Wallet"
    : busy
      ? step === "approve"
        ? "Approving…"
        : step === "escrow"
          ? "Escrowing…"
          : step === "match"
            ? "TEE matching…"
            : step === "settle"
              ? "Settling…"
              : "Working…"
      : !amountIn || Number(amountIn) <= 0
        ? "Enter an amount"
        : "Private Swap";

  return (
    <GhostPageShell
      title="Swap"
      subtitle="TEE sealed intent → match → attested settlement"
      maxWidth="xs"
      headerRight={
        <div className="flex items-center gap-1.5">
          <div
            className={`hidden sm:inline-flex px-2.5 py-1.5 rounded-full text-[11px] font-semibold border items-center gap-1 ${
              teeInfo?.configured
                ? "bg-[#b8ff30]/15 text-[#b8ff30] border-[#b8ff30]/30"
                : "bg-surface text-text-secondary border-border"
            }`}
          >
            <Shield className="w-3 h-3" />
            {teeInfo?.configured ? "TEE" : "Offline"}
          </div>
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className={`p-2 rounded-xl border transition-colors ${
              showSettings
                ? "bg-primary-soft text-primary border-primary/30"
                : "bg-surface text-text-secondary border-border hover:text-foreground hover:bg-surface-hover"
            }`}
            aria-label="Slippage settings"
            title={`Slippage ${slippage}%`}
          >
            <Settings className="w-[18px] h-[18px]" />
          </button>
        </div>
      }
    >
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-3 overflow-hidden"
          >
            <div className="p-4 rounded-2xl bg-surface border border-border">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-foreground">Slippage</div>
                  <div className="text-xs text-text-tertiary mt-0.5">
                    Max price movement before TEE settle reverts
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  {["0.1", "0.5", "1.0"].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setSlippage(val)}
                      className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                        slippage === val
                          ? "bg-primary-soft text-primary"
                          : "bg-surface-2 text-text-secondary hover:text-foreground"
                      }`}
                    >
                      {val}%
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="rounded-2xl bg-surface border border-border p-4 mb-4 text-sm text-text-secondary leading-relaxed">
        <div className="flex items-start gap-2">
          <Lock className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <p>
            <span className="text-foreground font-medium">All swaps are TEE-only.</span>{" "}
            tokenOut / minOut / salt stay encrypted until attestation. Escrow size is
            visible on-chain. Fill routes through Uniswap at settlement.
          </p>
        </div>
        {!routerAddress && (
          <p className="mt-2 text-amber-200/90 text-xs">
            PrivacyRouter not configured. Deploy with{" "}
            <code className="text-foreground">deployPrivacyRouter.ts</code> then set{" "}
            <code className="text-foreground">privacyRouter</code> in config.
          </p>
        )}
      </div>

      <div className="rounded-3xl bg-surface border border-border p-1.5">
        <div className="rounded-2xl bg-surface-2 p-4 sm:p-5">
          <div className="flex items-center justify-between text-sm text-text-tertiary mb-2">
            <span>You pay (escrowed)</span>
            <span className="text-xs">Bal: {formatAmount(balances[tokenIn.address])}</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={amountIn}
              onChange={(e) => setAmountIn(e.target.value)}
              className="flex-1 text-[32px] sm:text-4xl font-medium bg-transparent focus:outline-none placeholder-text-tertiary min-w-0"
            />
            <button
              onClick={() => setSelectingFor("in")}
              className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-surface hover:bg-surface-hover border border-border transition-colors shrink-0"
            >
              <TokenIcon symbol={tokenIn.symbol} size="sm" />
              <span className="text-[15px] font-semibold">{tokenIn.symbol}</span>
              <ChevronDown className="w-4 h-4 text-text-tertiary" />
            </button>
          </div>
        </div>

        <div className="flex justify-center -my-3 relative z-10">
          <button
            onClick={flipTokens}
            className="w-9 h-9 rounded-xl bg-surface border-[3px] border-background flex items-center justify-center hover:bg-surface-hover transition-colors"
          >
            <ArrowDown className="w-4 h-4 text-text-secondary" />
          </button>
        </div>

        <div className="rounded-2xl bg-surface-2 p-4 sm:p-5">
          <div className="flex items-center justify-between text-sm text-text-tertiary mb-2">
            <span className="inline-flex items-center gap-1">
              <Lock className="w-3 h-3" /> Sealed receive
            </span>
            <span className="text-xs">Bal: {formatAmount(balances[tokenOut.address])}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <span
                className={`text-[32px] sm:text-4xl font-medium truncate ${
                  quotedOut ? "" : "text-text-tertiary"
                }`}
              >
                {formatAmount(quotedOut)}
              </span>
              {isQuoting && <GhostLoader size="sm" className="scale-[0.55]" />}
            </div>
            <button
              onClick={() => setSelectingFor("out")}
              className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-surface hover:bg-surface-hover border border-border transition-colors shrink-0"
            >
              <TokenIcon symbol={tokenOut.symbol} size="sm" />
              <span className="text-[15px] font-semibold">{tokenOut.symbol}</span>
              <ChevronDown className="w-4 h-4 text-text-tertiary" />
            </button>
          </div>
        </div>
      </div>

      <button
        onClick={runPrivateSwap}
        disabled={
          busy || (isConnected && (!amountIn || Number(amountIn) <= 0))
        }
        className="mt-3 w-full px-4 py-3.5 rounded-2xl bg-primary text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {busy ? <GhostLoader size="sm" className="scale-75" /> : <Lock className="w-4 h-4" />}
        {actionLabel}
      </button>

      <div className="mt-3 rounded-2xl bg-surface border border-border p-4 text-sm text-text-secondary">
        <div className="text-xs text-text-tertiary mb-1">Pipeline</div>
        {statusBody}
        {intentId && (
          <div className="mt-2 text-xs font-mono text-foreground">Intent #{intentId}</div>
        )}
      </div>

      {txHash && (
        <div className="mt-3 rounded-2xl bg-surface border border-border p-4 text-sm flex items-center justify-between">
          <span className="text-text-secondary">Last transaction</span>
          <a
            href={getExplorerTxUrl(txHash)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-primary"
          >
            View <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-200">
          {error}
        </div>
      )}

      <AnimatePresence>
        {selectingFor && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              className="w-full max-w-[360px] rounded-2xl bg-surface border border-border p-4"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">Select token</h3>
                <button
                  onClick={() => setSelectingFor(null)}
                  className="p-1 rounded-lg hover:bg-surface-hover"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-2">
                {UNISWAP_TOKENS.map((t) => (
                  <button
                    key={t.address}
                    onClick={() => {
                      selectingFor === "in" ? setTokenIn(t) : setTokenOut(t);
                      setSelectingFor(null);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface-hover transition-colors"
                  >
                    <TokenIcon symbol={t.symbol} size="md" />
                    <div className="text-left">
                      <div className="text-sm font-medium">{t.symbol}</div>
                      <div className="text-xs text-text-tertiary">
                        {t.address.slice(0, 6)}...{t.address.slice(-4)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </GhostPageShell>
  );
}
