"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowDown, ChevronDown, Loader2, Plus, Minus, X, ExternalLink } from "lucide-react";
import { ethers } from "ethers";
import { getBrowserProvider } from "@/lib/ethereum";
import { useWallet } from "@/context/WalletContext";
import { UNISWAP_CONFIG, UNISWAP_TOKENS, type UniswapToken } from "@/lib/uniswapConfig";
import { ERC20_ABI, FACTORY_ABI, MANAGER_ABI, POOL_ABI } from "@/lib/uniswapAbis";
import { getExplorerTxUrl } from "@/lib/constants";
import { friendlyError } from "@/lib/errors";
import GhostPageShell from "@/components/GhostPageShell";
import GhostLoader from "@/components/GhostLoader";
import TokenIcon, { getTokenEmoji } from "@/components/TokenIcon";
import { useToast } from "@/context/ToastContext";

const FEE_OPTIONS = [
  { label: "0.05%", value: 500 },
  { label: "0.30%", value: 3000 },
];

type Mode = "add" | "remove";
type ApproveStep = "A" | "B" | null;

type TokenMeta = { symbol: string; decimals: number };

function findToken(address?: string | null): UniswapToken | undefined {
  if (!address) return undefined;
  return UNISWAP_TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase());
}

export default function LiquidityPage() {
  return (
    <Suspense fallback={<GhostLoader size="lg" fullScreen />}>
      <LiquidityContent />
    </Suspense>
  );
}

function LiquidityContent() {
  const searchParams = useSearchParams();
  const { isConnected, connect, address } = useWallet();
  const { showSuccess, showError } = useToast();

  const initialA = findToken(searchParams.get("tokenA")) ?? UNISWAP_TOKENS[0];
  const initialB =
    findToken(searchParams.get("tokenB")) ??
    UNISWAP_TOKENS.find((t) => t.address !== initialA.address) ??
    UNISWAP_TOKENS[1];
  const initialFee = Number(searchParams.get("fee") || FEE_OPTIONS[1].value);
  const initialMode = searchParams.get("mode") === "remove" ? "remove" : "add";

  const [mode, setMode] = useState<Mode>(initialMode);
  const [tokenA, setTokenA] = useState<UniswapToken>(initialA);
  const [tokenB, setTokenB] = useState<UniswapToken>(
    initialB.address === initialA.address
      ? UNISWAP_TOKENS.find((t) => t.address !== initialA.address) ?? UNISWAP_TOKENS[1]
      : initialB
  );
  const [fee, setFee] = useState<number>(
    FEE_OPTIONS.some((f) => f.value === initialFee) ? initialFee : FEE_OPTIONS[1].value
  );
  const [lowerTick, setLowerTick] = useState("");
  const [upperTick, setUpperTick] = useState("");
  const [amountA, setAmountA] = useState("");
  const [amountB, setAmountB] = useState("");
  const [removeLiquidity, setRemoveLiquidity] = useState("");

  const [selectingFor, setSelectingFor] = useState<"A" | "B" | null>(null);
  const [tokenMeta, setTokenMeta] = useState<Record<string, TokenMeta>>({});
  const [needsApproveA, setNeedsApproveA] = useState(true);
  const [needsApproveB, setNeedsApproveB] = useState(true);
  const [isCheckingAllowance, setIsCheckingAllowance] = useState(false);
  const [isApproving, setIsApproving] = useState<ApproveStep>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const nextA = findToken(searchParams.get("tokenA"));
    const nextB = findToken(searchParams.get("tokenB"));
    const nextFee = Number(searchParams.get("fee") || "");
    const nextMode = searchParams.get("mode") === "remove" ? "remove" : "add";

    if (nextA) setTokenA(nextA);
    if (nextB && (!nextA || nextB.address !== nextA.address)) setTokenB(nextB);
    if (FEE_OPTIONS.some((f) => f.value === nextFee)) setFee(nextFee);
    if (searchParams.get("mode")) setMode(nextMode);
  }, [searchParams]);

  const tokenOptions = useMemo(
    () => UNISWAP_TOKENS.filter((t) => t.address !== tokenA.address),
    [tokenA.address]
  );

  const loadTokenMeta = async (token: UniswapToken) => {
    if (tokenMeta[token.address]) return tokenMeta[token.address];
    const provider = getBrowserProvider();
    const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
    const [symbol, decimals] = await Promise.all([contract.symbol(), contract.decimals()]);
    const meta = { symbol: String(symbol), decimals: Number(decimals) };
    setTokenMeta((prev) => ({ ...prev, [token.address]: meta }));
    return meta;
  };

  const getSigner = async () => {
    if (!window.ethereum) throw new Error("No wallet found.");
    const provider = getBrowserProvider();
    return provider.getSigner();
  };

  useEffect(() => {
    let mounted = true;
    const timer = setTimeout(async () => {
      if (
        mode !== "add" ||
        !isConnected ||
        !address ||
        !window.ethereum ||
        !amountA ||
        !amountB
      ) {
        if (mounted) {
          setNeedsApproveA(true);
          setNeedsApproveB(true);
        }
        return;
      }
      setIsCheckingAllowance(true);
      try {
        const provider = getBrowserProvider();
        const [metaA, metaB] = await Promise.all([loadTokenMeta(tokenA), loadTokenMeta(tokenB)]);
        const parsedA = ethers.parseUnits(amountA, metaA.decimals);
        const parsedB = ethers.parseUnits(amountB, metaB.decimals);
        const ercA = new ethers.Contract(tokenA.address, ERC20_ABI, provider);
        const ercB = new ethers.Contract(tokenB.address, ERC20_ABI, provider);
        const [allowA, allowB]: [bigint, bigint] = await Promise.all([
          ercA.allowance(address, UNISWAP_CONFIG.managerAddress),
          ercB.allowance(address, UNISWAP_CONFIG.managerAddress),
        ]);
        if (mounted) {
          setNeedsApproveA(allowA < parsedA);
          setNeedsApproveB(allowB < parsedB);
        }
      } catch {
        if (mounted) {
          setNeedsApproveA(true);
          setNeedsApproveB(true);
        }
      } finally {
        if (mounted) setIsCheckingAllowance(false);
      }
    }, 300);
    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [mode, isConnected, address, amountA, amountB, tokenA.address, tokenB.address]);

  const approveMax = async (token: UniswapToken, which: "A" | "B") => {
    setIsApproving(which);
    setError(null);
    try {
      const signer = await getSigner();
      const erc20 = new ethers.Contract(token.address, ERC20_ABI, signer);
      const tx = await erc20.approve(UNISWAP_CONFIG.managerAddress, ethers.MaxUint256);
      await tx.wait();
      setTxHash(tx.hash);
      if (which === "A") setNeedsApproveA(false);
      else setNeedsApproveB(false);
      showSuccess(`${token.symbol} approved (max allowance)`);
    } catch (err: unknown) {
      const msg = friendlyError(err, "Approval failed.");
      setError(msg);
      showError(msg);
    } finally {
      setIsApproving(null);
    }
  };

  const addLiquidity = async () => {
    if (!amountA || !amountB || !lowerTick || !upperTick) return;
    if (!isConnected || !address) return;
    setIsProcessing(true);
    setError(null);
    try {
      const signer = await getSigner();
      const factory = new ethers.Contract(UNISWAP_CONFIG.factoryAddress, FACTORY_ABI, signer);
      const poolAddress: string = await factory.pools(tokenA.address, tokenB.address, fee);
      if (!poolAddress || poolAddress === ethers.ZeroAddress) {
        throw new Error(
          `No pool for ${tokenA.symbol}/${tokenB.symbol} at this fee. Create it on Admin first.`
        );
      }

      const [metaA, metaB] = await Promise.all([loadTokenMeta(tokenA), loadTokenMeta(tokenB)]);
      const amountAWei = ethers.parseUnits(amountA, metaA.decimals);
      const amountBWei = ethers.parseUnits(amountB, metaB.decimals);
      // amount0/amount1 must follow sorted token0 < token1 order
      const aIsToken0 = tokenA.address.toLowerCase() < tokenB.address.toLowerCase();
      const manager = new ethers.Contract(UNISWAP_CONFIG.managerAddress, MANAGER_ABI, signer);
      const params = {
        tokenA: tokenA.address,
        tokenB: tokenB.address,
        fee,
        lowerTick: Number(lowerTick),
        upperTick: Number(upperTick),
        amount0Desired: aIsToken0 ? amountAWei : amountBWei,
        amount1Desired: aIsToken0 ? amountBWei : amountAWei,
        amount0Min: 0,
        amount1Min: 0,
      };
      const tx = await manager.mint(params);
      await tx.wait();
      setTxHash(tx.hash);
      showSuccess(`Added ${amountA} ${tokenA.symbol} + ${amountB} ${tokenB.symbol}`);
      setAmountA("");
      setAmountB("");
    } catch (err: unknown) {
      const msg = friendlyError(err, "Add liquidity failed.");
      setError(msg);
      showError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const applyMockParams = () => {
    setFee(3000);
    setLowerTick("-60000");
    setUpperTick("60000");
    setAmountA("100");
    setAmountB("100");
  };

  const removeLiquidityAction = async () => {
    if (!lowerTick || !upperTick || !removeLiquidity) return;
    if (!isConnected || !address) return;
    setIsProcessing(true);
    setError(null);
    try {
      const signer = await getSigner();
      const factory = new ethers.Contract(UNISWAP_CONFIG.factoryAddress, FACTORY_ABI, signer);
      const poolAddress: string = await factory.pools(tokenA.address, tokenB.address, fee);
      if (poolAddress === ethers.ZeroAddress) {
        throw new Error("Pool not found for selected pair and fee.");
      }
      const pool = new ethers.Contract(poolAddress, POOL_ABI, signer);
      const burnTx = await pool.burn(Number(lowerTick), Number(upperTick), BigInt(removeLiquidity));
      await burnTx.wait();
      const maxUint128 = (1n << 128n) - 1n;
      const collectTx = await pool.collect(address, Number(lowerTick), Number(upperTick), maxUint128, maxUint128);
      await collectTx.wait();
      setTxHash(collectTx.hash);
      setRemoveLiquidity("");
      showSuccess("Liquidity removed");
    } catch (err: unknown) {
      const msg = friendlyError(err, "Remove liquidity failed.");
      setError(msg);
      showError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const formReady =
    Boolean(amountA) &&
    Boolean(amountB) &&
    Boolean(lowerTick) &&
    Boolean(upperTick) &&
    Number(amountA) > 0 &&
    Number(amountB) > 0;

  const busy = isApproving !== null || isProcessing || isCheckingAllowance;

  const addActionLabel = !isConnected
    ? "Connect Wallet"
    : !formReady
      ? "Enter amounts & ticks"
      : isApproving === "A"
        ? `Approving ${tokenA.symbol}…`
        : isApproving === "B"
          ? `Approving ${tokenB.symbol}…`
          : isProcessing
            ? "Adding liquidity…"
            : needsApproveA
              ? `Approve ${tokenA.symbol}`
              : needsApproveB
                ? `Approve ${tokenB.symbol}`
                : "Add Liquidity";

  const onPrimaryAction = () => {
    if (mode === "remove") {
      removeLiquidityAction();
      return;
    }
    if (!isConnected) {
      connect();
      return;
    }
    if (!formReady) return;
    if (needsApproveA) {
      approveMax(tokenA, "A");
      return;
    }
    if (needsApproveB) {
      approveMax(tokenB, "B");
      return;
    }
    addLiquidity();
  };

  return (
    <GhostPageShell
      title="Liquidity"
      subtitle={
        tokenA && tokenB
          ? `${getTokenEmoji(tokenA.symbol)} ${tokenA.symbol} / ${getTokenEmoji(tokenB.symbol)} ${tokenB.symbol} · ${
              FEE_OPTIONS.find((f) => f.value === fee)?.label ?? fee
            }`
          : "Add or remove concentrated liquidity"
      }
      headerRight={
        <div className="flex items-center gap-1 bg-surface rounded-2xl p-1">
          {(["add", "remove"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                setMode(m);
                setError(null);
                setTxHash(null);
              }}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                mode === m ? "bg-surface-2 text-foreground" : "text-text-secondary hover:text-foreground"
              }`}
            >
              {m === "add" ? "Add" : "Remove"}
            </button>
          ))}
        </div>
      }
    >
        {/* Card */}
        <div className="rounded-3xl bg-surface border border-border p-1.5">
          <div className="rounded-2xl bg-surface-2 p-4 sm:p-5">
            <div className="flex items-center justify-between text-sm text-text-tertiary mb-2">
              <span>{mode === "add" ? "You deposit" : "Position"}</span>
              <div className="flex items-center gap-2">
                {mode === "add" && (
                  <button
                    onClick={applyMockParams}
                    className="px-3 py-1.5 rounded-xl bg-surface border border-border text-xs font-medium"
                  >
                    Use Mock Params
                  </button>
                )}
                <select
                  className="bg-transparent text-xs text-text-secondary outline-none"
                  value={fee}
                  onChange={(e) => setFee(Number(e.target.value))}
                >
                  {FEE_OPTIONS.map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex items-center gap-3">
                <input type="number" inputMode="decimal" placeholder="0" value={amountA} onChange={(e) => setAmountA(e.target.value)}
                  disabled={mode === "remove"}
                  className="flex-1 text-[28px] sm:text-3xl font-medium bg-transparent focus:outline-none placeholder-text-tertiary min-w-0" />
                <button onClick={() => setSelectingFor("A")}
                  className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-surface hover:bg-surface-hover border border-border transition-colors shrink-0">
                  <TokenIcon symbol={tokenA.symbol} size="sm" />
                  <span className="text-[14px] font-semibold">{tokenA.symbol}</span>
                  <ChevronDown className="w-4 h-4 text-text-tertiary" />
                </button>
              </div>
              <div className="flex items-center gap-3">
                <input type="number" inputMode="decimal" placeholder="0" value={amountB} onChange={(e) => setAmountB(e.target.value)}
                  disabled={mode === "remove"}
                  className="flex-1 text-[28px] sm:text-3xl font-medium bg-transparent focus:outline-none placeholder-text-tertiary min-w-0" />
                <button onClick={() => setSelectingFor("B")}
                  className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-surface hover:bg-surface-hover border border-border transition-colors shrink-0">
                  <TokenIcon symbol={tokenB.symbol} size="sm" />
                  <span className="text-[14px] font-semibold">{tokenB.symbol}</span>
                  <ChevronDown className="w-4 h-4 text-text-tertiary" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-center -my-3 relative z-10">
            <div className="w-9 h-9 rounded-xl bg-surface border-[3px] border-background flex items-center justify-center">
              <ArrowDown className="w-4 h-4 text-text-secondary" />
            </div>
          </div>

          <div className="rounded-2xl bg-surface-2 p-4 sm:p-5">
            <div className="text-sm text-text-tertiary mb-2">Ticks</div>
            <div className="flex items-center gap-2">
              <input
                placeholder="Lower"
                value={lowerTick}
                onChange={(e) => setLowerTick(e.target.value)}
                className="w-full bg-transparent text-sm outline-none"
              />
              <input
                placeholder="Upper"
                value={upperTick}
                onChange={(e) => setUpperTick(e.target.value)}
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>

            {mode === "remove" && (
              <div className="mt-3">
                <div className="text-sm text-text-tertiary mb-2">Liquidity (uint128)</div>
                <input
                  placeholder="0"
                  value={removeLiquidity}
                  onChange={(e) => setRemoveLiquidity(e.target.value)}
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>
            )}
          </div>
        </div>

        <button
          onClick={onPrimaryAction}
          disabled={
            busy ||
            (mode === "add"
              ? isConnected && !formReady
              : !isConnected || !lowerTick || !upperTick || !removeLiquidity)
          }
          className="mt-3 w-full px-4 py-3.5 rounded-2xl bg-primary text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {(isApproving !== null || isProcessing) && <Loader2 className="w-4 h-4 animate-spin" />}
          {mode === "add" ? (
            <>
              {!needsApproveA && !needsApproveB && formReady && isApproving === null && !isProcessing && (
                <Plus className="w-4 h-4" />
              )}
              {addActionLabel}
            </>
          ) : (
            <>
              {!isProcessing && <Minus className="w-4 h-4" />}
              {isProcessing ? "Removing…" : "Remove Liquidity"}
            </>
          )}
        </button>

        {txHash && (
          <div className="mt-3 rounded-2xl bg-surface border border-border p-4 text-sm flex items-center justify-between">
            <span className="text-text-secondary">Last transaction</span>
            <a href={getExplorerTxUrl(txHash)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary">
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <motion.div initial={{ scale: 0.98, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.98, opacity: 0 }}
                className="w-full max-w-[360px] rounded-2xl bg-surface border border-border p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold">Select token</h3>
                  <button onClick={() => setSelectingFor(null)} className="p-1 rounded-lg hover:bg-surface-hover">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="space-y-2">
                  {(selectingFor === "B" ? tokenOptions : UNISWAP_TOKENS).map((t) => (
                    <button key={t.address} onClick={() => { selectingFor === "A" ? setTokenA(t) : setTokenB(t); setSelectingFor(null); }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-surface-hover transition-colors">
                      <TokenIcon symbol={t.symbol} size="md" />
                      <div className="text-left">
                        <div className="text-sm font-medium">{t.symbol}</div>
                        <div className="text-xs text-text-tertiary">{t.address.slice(0, 6)}...{t.address.slice(-4)}</div>
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
