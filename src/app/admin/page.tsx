"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, ExternalLink, PlusCircle, Coins, RefreshCw } from "lucide-react";
import { ethers } from "ethers";
import { getBrowserProvider, getCoston2RpcProvider, BALANCES_CHANGED_EVENT } from "@/lib/ethereum";
import { useWallet } from "@/context/WalletContext";
import { UNISWAP_CONFIG, UNISWAP_TOKENS, MINTABLE_TOKENS, type UniswapToken } from "@/lib/uniswapConfig";
import { ERC20_ABI, FACTORY_ABI, TESTUTILS_ABI, POOL_ABI } from "@/lib/uniswapAbis";
import { getExplorerTxUrl, getExplorerContractUrl } from "@/lib/constants";
import { formatAmount } from "@/lib/format";
import { friendlyError } from "@/lib/errors";
import GhostPageShell from "@/components/GhostPageShell";
import FaucetButton from "@/components/FaucetButton";
import TokenIcon, { getTokenEmoji } from "@/components/TokenIcon";
import { useToast } from "@/context/ToastContext";

type TokenMeta = { symbol: string; decimals: number };

export default function AdminPage() {
  const { isConnected, connect, address } = useWallet();
  const { showSuccess, showError, showInfo } = useToast();
  const [tokenA, setTokenA] = useState<UniswapToken>(UNISWAP_TOKENS[0]);
  const [tokenB, setTokenB] = useState<UniswapToken>(UNISWAP_TOKENS[1]);
  const [fee, setFee] = useState(3000);
  const [price, setPrice] = useState("");
  const [mintToken, setMintToken] = useState<UniswapToken>(UNISWAP_TOKENS[0]);
  const [mintTo, setMintTo] = useState("");
  const [mintAmount, setMintAmount] = useState("");
  const [tokenMeta, setTokenMeta] = useState<Record<string, TokenMeta>>({});
  const [balances, setBalances] = useState<Record<string, string>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [isMinting, setIsMinting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRefreshingPools, setIsRefreshingPools] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [createdPool, setCreatedPool] = useState<string | null>(null);
  const [pools, setPools] = useState<Array<{ key: string; address: string; fee: number }>>([]);
  const [poolDetails, setPoolDetails] = useState<Record<string, {
    token0: string;
    token1: string;
    fee: number;
    tickSpacing: number;
    liquidity: string;
    sqrtPriceX96: string;
    tick: number;
    observationIndex: number;
    observationCardinality: number;
    observationCardinalityNext: number;
  }>>({});
  const [loadingPool, setLoadingPool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tokenOptions = useMemo(
    () => UNISWAP_TOKENS.filter((t) => t.address !== tokenA.address),
    [tokenA.address]
  );

  const getSigner = async () => {
    if (!window.ethereum) throw new Error("No wallet found.");
    const provider = getBrowserProvider();
    return provider.getSigner();
  };

  const loadTokenMeta = async (token: UniswapToken) => {
    if (tokenMeta[token.address]) return tokenMeta[token.address];
    const provider = getCoston2RpcProvider();
    const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
    const [symbol, decimals] = await Promise.all([contract.symbol(), contract.decimals()]);
    const meta = { symbol: String(symbol), decimals: Number(decimals) };
    setTokenMeta((prev) => ({ ...prev, [token.address]: meta }));
    return meta;
  };

  const createPool = async () => {
    if (!price) return;
    setIsCreating(true);
    setError(null);
    try {
      const signer = await getSigner();
      const testutils = new ethers.Contract(UNISWAP_CONFIG.testutils, TESTUTILS_ABI, signer);
      const tx = await testutils.deployPool(
        UNISWAP_CONFIG.factoryAddress,
        tokenA.address,
        tokenB.address,
        fee,
        BigInt(price)
      );
      await tx.wait();
      setTxHash(tx.hash);
      const factory = new ethers.Contract(UNISWAP_CONFIG.factoryAddress, FACTORY_ABI, signer);
      const poolAddress: string = await factory.pools(tokenA.address, tokenB.address, fee);
      setCreatedPool(poolAddress);
      showSuccess(`Pool created: ${tokenA.symbol}/${tokenB.symbol}`);
    } catch (err: unknown) {
      const msg = friendlyError(err, "Pool creation failed.");
      setError(msg);
      showError(msg);
    } finally {
      setIsCreating(false);
    }
  };

  const mintTokens = async () => {
    if (!mintAmount) return;
    setIsMinting(true);
    setError(null);
    try {
      const signer = await getSigner();
      const to = mintTo || (address ?? "");
      if (!to) throw new Error("Recipient address required.");
      const meta = await loadTokenMeta(mintToken);
      const contract = new ethers.Contract(mintToken.address, ERC20_ABI, signer);
      const tx = await contract.mint(to, ethers.parseUnits(mintAmount, meta.decimals));
      await tx.wait();
      setTxHash(tx.hash);
      showSuccess(`Minted ${mintAmount} ${mintToken.symbol}`);
      await refreshBalances();
    } catch (err: unknown) {
      const msg = friendlyError(err, "Mint failed.");
      setError(msg);
      showError(msg);
    } finally {
      setIsMinting(false);
    }
  };

  const refreshBalances = async () => {
    if (!address) return;
    setIsRefreshing(true);
    setError(null);
    try {
      const provider = getCoston2RpcProvider();
      const results: Record<string, string> = {};
      for (const token of UNISWAP_TOKENS) {
        const meta = await loadTokenMeta(token);
        const contract = new ethers.Contract(token.address, ERC20_ABI, provider);
        const balance: bigint = await contract.balanceOf(address);
        results[token.address] = ethers.formatUnits(balance, meta.decimals);
      }
      setBalances(results);
    } catch (err: unknown) {
      setError(friendlyError(err, "Failed to fetch balances."));
    } finally {
      setIsRefreshing(false);
    }
  };

  const refreshPools = async () => {
    setIsRefreshingPools(true);
    setError(null);
    try {
      if (!window.ethereum) throw new Error("No wallet found.");
      const provider = getBrowserProvider();
      const factory = new ethers.Contract(UNISWAP_CONFIG.factoryAddress, FACTORY_ABI, provider);
      const discovered: Array<{ key: string; address: string; fee: number }> = [];
      const fees = [500, 3000];
      for (let i = 0; i < UNISWAP_TOKENS.length; i += 1) {
        for (let j = i + 1; j < UNISWAP_TOKENS.length; j += 1) {
          const a = UNISWAP_TOKENS[i];
          const b = UNISWAP_TOKENS[j];
          for (const f of fees) {
            const poolAddress: string = await factory.pools(a.address, b.address, f);
            if (poolAddress !== ethers.ZeroAddress) {
              discovered.push({ key: `${a.symbol}/${b.symbol}`, address: poolAddress, fee: f });
            }
          }
        }
      }
      setPools(discovered);
    } catch (err: unknown) {
      setError(friendlyError(err, "Failed to fetch pools."));
    } finally {
      setIsRefreshingPools(false);
    }
  };

  const fetchPoolDetails = async (poolAddress: string) => {
    setLoadingPool(poolAddress);
    setError(null);
    try {
      if (!window.ethereum) throw new Error("No wallet found.");
      const provider = getBrowserProvider();
      const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
      const [token0, token1, feeValue, tickSpacing, liquidity, slot0] = await Promise.all([
        pool.token0(),
        pool.token1(),
        pool.fee(),
        pool.tickSpacing(),
        pool.liquidity(),
        pool.slot0(),
      ]);
      setPoolDetails((prev) => ({
        ...prev,
        [poolAddress]: {
          token0,
          token1,
          fee: Number(feeValue),
          tickSpacing: Number(tickSpacing),
          liquidity: String(liquidity),
          sqrtPriceX96: String(slot0[0]),
          tick: Number(slot0[1]),
          observationIndex: Number(slot0[2]),
          observationCardinality: Number(slot0[3]),
          observationCardinalityNext: Number(slot0[4]),
        },
      }));
    } catch (err: unknown) {
      setError(friendlyError(err, "Failed to fetch pool details."));
    } finally {
      setLoadingPool(null);
    }
  };

  useEffect(() => {
    if (isConnected && address) {
      refreshBalances();
    }
  }, [isConnected, address]);

  useEffect(() => {
    const onBal = () => {
      if (isConnected && address) refreshBalances();
    };
    window.addEventListener(BALANCES_CHANGED_EVENT, onBal);
    return () => window.removeEventListener(BALANCES_CHANGED_EVENT, onBal);
  }, [isConnected, address]);

  return (
    <GhostPageShell
      title="Admin"
      subtitle="Create pools and mint mock tokens"
      maxWidth="md"
      headerRight={
        !isConnected ? (
          <button onClick={connect} className="px-4 py-2 rounded-xl bg-surface border border-border text-sm font-medium">
            Connect Wallet
          </button>
        ) : undefined
      }
    >
        <div className="space-y-6">
        <div className="rounded-3xl bg-surface border border-border p-1.5">
          <div className="rounded-2xl bg-surface-2 p-4 sm:p-5 space-y-4">
            <div className="text-sm text-text-tertiary">Create Pool</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-surface p-3 border border-border">
                <div className="text-xs text-text-tertiary mb-2">Token A</div>
                <div className="flex items-center gap-2">
                  <TokenIcon symbol={tokenA.symbol} size="sm" />
                  <select
                    className="w-full bg-transparent text-sm font-medium outline-none"
                    value={tokenA.address}
                    onChange={(e) => {
                      const next = UNISWAP_TOKENS.find((t) => t.address === e.target.value);
                      if (next) setTokenA(next);
                    }}
                  >
                    {UNISWAP_TOKENS.map((t) => (
                      <option key={t.address} value={t.address}>
                        {getTokenEmoji(t.symbol)} {t.symbol}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-text-tertiary" />
                </div>
              </div>
              <div className="rounded-2xl bg-surface p-3 border border-border">
                <div className="text-xs text-text-tertiary mb-2">Token B</div>
                <div className="flex items-center gap-2">
                  <TokenIcon symbol={tokenB.symbol} size="sm" />
                  <select
                    className="w-full bg-transparent text-sm font-medium outline-none"
                    value={tokenB.address}
                    onChange={(e) => {
                      const next = UNISWAP_TOKENS.find((t) => t.address === e.target.value);
                      if (next) setTokenB(next);
                    }}
                  >
                    {tokenOptions.map((t) => (
                      <option key={t.address} value={t.address}>
                        {getTokenEmoji(t.symbol)} {t.symbol}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-text-tertiary" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-surface p-3 border border-border">
                <div className="text-xs text-text-tertiary mb-2">Fee Tier</div>
                <select
                  className="w-full bg-transparent text-sm font-medium outline-none"
                  value={fee}
                  onChange={(e) => setFee(Number(e.target.value))}
                >
                  <option value={500}>0.05%</option>
                  <option value={3000}>0.30%</option>
                </select>
              </div>
              <div className="rounded-2xl bg-surface p-3 border border-border">
                <div className="text-xs text-text-tertiary mb-2">Current Price (integer)</div>
                <input
                  placeholder="100"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>
            </div>

            <button
              onClick={() => {
                if (!isConnected) {
                  connect();
                  return;
                }
                if (!price.trim()) {
                  setError("Enter a current price (integer), e.g. 100.");
                  showInfo("Enter a current price (integer), e.g. 100.");
                  return;
                }
                createPool();
              }}
              disabled={isCreating}
              className="w-full px-4 py-3 rounded-2xl bg-primary text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isCreating ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <PlusCircle className="w-4 h-4" />
              )}
              {!isConnected
                ? "Connect Wallet to Create Pool"
                : !price.trim()
                  ? "Enter Price to Create Pool"
                  : "Create Pool"}
            </button>
            {!isConnected && (
              <p className="text-xs text-text-tertiary text-center">
                Connect MetaMask on Flare Coston2 (chain 114), then fill Current Price (e.g. 100).
              </p>
            )}
            {isConnected && !price.trim() && (
              <p className="text-xs text-text-tertiary text-center">
                Fill <span className="text-foreground">Current Price (integer)</span> — try{" "}
                <button
                  type="button"
                  className="underline text-primary"
                  onClick={() => setPrice("100")}
                >
                  use 100
                </button>
                .
              </p>
            )}

            {createdPool && (
              <div className="text-sm text-text-secondary flex items-center justify-between">
                <span>Pool address</span>
                <a className="inline-flex items-center gap-1 text-primary" href={getExplorerContractUrl(createdPool)} target="_blank" rel="noreferrer">
                  {createdPool.slice(0, 6)}...{createdPool.slice(-4)} <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl bg-surface border border-border p-1.5">
          <div className="rounded-2xl bg-surface-2 p-4 sm:p-5 space-y-4">
            <div className="text-sm text-text-tertiary">GhostBook Faucet</div>
            <p className="text-xs text-text-tertiary -mt-2 leading-relaxed">
              Available to every user from the navbar. Drips{" "}
              <span className="text-foreground">👻 GHOST</span>,{" "}
              <span className="text-foreground">📖 BOOK</span>, and{" "}
              <span className="text-foreground">⚡ SPARK</span> when balance is below{" "}
              <span className="text-foreground">100</span> (tops up to 100).
            </p>
            <FaucetButton
              variant="full"
              className=""
            />
            {isConnected && (
              <button
                type="button"
                onClick={refreshBalances}
                className="w-full text-xs text-text-tertiary hover:text-foreground transition-colors"
              >
                Refresh balances after drip
              </button>
            )}
          </div>
        </div>

        <div className="rounded-3xl bg-surface border border-border p-1.5">
          <div className="rounded-2xl bg-surface-2 p-4 sm:p-5 space-y-4">
            <div className="text-sm text-text-tertiary">Mint Tokens</div>
            <p className="text-xs text-text-tertiary -mt-2">
              Mock tokens only. USDT0 / FXRP come from the Coston2 faucet.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-surface p-3 border border-border">
                <div className="text-xs text-text-tertiary mb-2">Token</div>
                <div className="flex items-center gap-2">
                  <TokenIcon symbol={mintToken.symbol} size="sm" />
                  <select
                    className="w-full bg-transparent text-sm font-medium outline-none"
                    value={mintToken.address}
                    onChange={(e) => {
                      const next = MINTABLE_TOKENS.find((t) => t.address === e.target.value);
                      if (next) setMintToken(next);
                    }}
                  >
                    {MINTABLE_TOKENS.map((t) => (
                      <option key={t.address} value={t.address}>
                        {getTokenEmoji(t.symbol)} {t.symbol}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-text-tertiary" />
                </div>
              </div>
              <div className="rounded-2xl bg-surface p-3 border border-border">
                <div className="text-xs text-text-tertiary mb-2">Amount</div>
                <input
                  placeholder="1000"
                  value={mintAmount}
                  onChange={(e) => setMintAmount(e.target.value)}
                  className="w-full bg-transparent text-sm outline-none"
                />
              </div>
            </div>
            <div className="rounded-2xl bg-surface p-3 border border-border">
              <div className="text-xs text-text-tertiary mb-2">Recipient (optional)</div>
              <input
                placeholder={address ?? "0x..."}
                value={mintTo}
                onChange={(e) => setMintTo(e.target.value)}
                className="w-full bg-transparent text-sm outline-none"
              />
            </div>
            <button
              onClick={mintTokens}
              disabled={!isConnected || isMinting}
              className="w-full px-4 py-3 rounded-2xl bg-surface border border-border text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isMinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Coins className="w-4 h-4" />}
              Mint Tokens
            </button>
          </div>
        </div>

        <div className="rounded-3xl bg-surface border border-border p-1.5">
          <div className="rounded-2xl bg-surface-2 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-text-tertiary">Token Balances</div>
              <button
                onClick={refreshBalances}
                disabled={!isConnected || isRefreshing}
                className="px-3 py-2 rounded-xl bg-surface border border-border text-xs font-medium flex items-center gap-1.5"
              >
                {isRefreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Refresh
              </button>
            </div>
            <div className="space-y-2">
              {UNISWAP_TOKENS.map((token) => (
                <div key={token.address} className="flex items-center justify-between p-3 rounded-2xl bg-surface border border-border">
                  <div className="flex items-center gap-2.5">
                    <TokenIcon symbol={token.symbol} size="sm" />
                    <div className="text-sm font-medium">{token.symbol}</div>
                  </div>
                  <div className="text-sm text-text-secondary font-mono">
                    {formatAmount(balances[token.address])}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-surface border border-border p-1.5">
          <div className="rounded-2xl bg-surface-2 p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-text-tertiary">Pools</div>
              <button
                onClick={refreshPools}
                disabled={isRefreshingPools}
                className="px-3 py-2 rounded-xl bg-surface border border-border text-xs font-medium flex items-center gap-1.5"
              >
                {isRefreshingPools ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Refresh
              </button>
            </div>
            <div className="space-y-2">
              {(pools.length ? pools : UNISWAP_CONFIG.pools.map((p) => {
                const key = Object.keys(p)[0] ?? "pool";
                return { key, address: p[key], fee: 3000 };
              })).map((pool) => (
                <div key={`${pool.key}-${pool.address}`} className="p-3 rounded-2xl bg-surface border border-border space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{pool.key}</div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => fetchPoolDetails(pool.address)}
                        className="px-3 py-1.5 rounded-xl bg-surface-2 border border-border text-xs font-medium"
                      >
                        {loadingPool === pool.address ? "Loading..." : "Details"}
                      </button>
                      <a
                        className="text-sm text-primary inline-flex items-center gap-1 font-mono"
                        href={getExplorerContractUrl(pool.address)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {pool.address.slice(0, 6)}...{pool.address.slice(-4)} <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                  {poolDetails[pool.address] && (
                    <div className="grid grid-cols-2 gap-3 text-xs text-text-secondary">
                      <div className="rounded-xl bg-surface-2 border border-border p-3">
                        <div className="text-text-tertiary mb-1">Token0</div>
                        <div className="font-mono">{poolDetails[pool.address].token0}</div>
                      </div>
                      <div className="rounded-xl bg-surface-2 border border-border p-3">
                        <div className="text-text-tertiary mb-1">Token1</div>
                        <div className="font-mono">{poolDetails[pool.address].token1}</div>
                      </div>
                      <div className="rounded-xl bg-surface-2 border border-border p-3">
                        <div className="text-text-tertiary mb-1">Fee</div>
                        <div>{poolDetails[pool.address].fee}</div>
                      </div>
                      <div className="rounded-xl bg-surface-2 border border-border p-3">
                        <div className="text-text-tertiary mb-1">Tick Spacing</div>
                        <div>{poolDetails[pool.address].tickSpacing}</div>
                      </div>
                      <div className="rounded-xl bg-surface-2 border border-border p-3">
                        <div className="text-text-tertiary mb-1">Liquidity</div>
                        <div>{poolDetails[pool.address].liquidity}</div>
                      </div>
                      <div className="rounded-xl bg-surface-2 border border-border p-3">
                        <div className="text-text-tertiary mb-1">Tick</div>
                        <div>{poolDetails[pool.address].tick}</div>
                      </div>
                      <div className="rounded-xl bg-surface-2 border border-border p-3">
                        <div className="text-text-tertiary mb-1">Obs. Index</div>
                        <div>{poolDetails[pool.address].observationIndex}</div>
                      </div>
                      <div className="rounded-xl bg-surface-2 border border-border p-3">
                        <div className="text-text-tertiary mb-1">Obs. Cardinality</div>
                        <div>{poolDetails[pool.address].observationCardinality}</div>
                      </div>
                      <div className="rounded-xl bg-surface-2 border border-border p-3">
                        <div className="text-text-tertiary mb-1">Obs. Cardinality Next</div>
                        <div>{poolDetails[pool.address].observationCardinalityNext}</div>
                      </div>
                      <div className="rounded-xl bg-surface-2 border border-border p-3 col-span-2">
                        <div className="text-text-tertiary mb-1">sqrtPriceX96</div>
                        <div className="font-mono break-all">{poolDetails[pool.address].sqrtPriceX96}</div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {!pools.length && UNISWAP_CONFIG.pools.length === 0 && (
                <div className="text-sm text-text-secondary">No pools found yet.</div>
              )}
            </div>
          </div>
        </div>

        {txHash && (
          <div className="rounded-2xl bg-surface border border-border p-4 text-sm flex items-center justify-between">
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
          <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-4 text-sm text-red-200">
            {error}
          </div>
        )}
        </div>
    </GhostPageShell>
  );
}
