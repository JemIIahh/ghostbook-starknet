/**
 * Deploy 3 MockToken ERC-20s on Coston2, mint to deployer, save addresses.
 *
 * Usage:
 *   npx hardhat run scripts/deployMockTokens.ts --network coston2
 */
import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join(__dirname, "uniswap.config.json");

const TOKENS = [
  { key: "ghost", name: "GhostBook Token", symbol: "GHOST" },
  { key: "book", name: "Book Token", symbol: "BOOK" },
  { key: "spark", name: "Spark Token", symbol: "SPARK" },
] as const;

const MINT_AMOUNT = ethers.parseUnits("1000000", 18); // 1M each

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  }
  return { network: "coston2", uniswap: {}, tokens: {} };
}

function saveConfig(cfg: unknown) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
  console.log("Config saved:", CONFIG_PATH);
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log(
    "Balance:",
    ethers.formatEther(await deployer.provider!.getBalance(deployer.address)),
    "C2FLR"
  );

  const factory = await ethers.getContractFactory("MockToken");
  const cfg = loadConfig();
  cfg.network = "coston2";
  cfg.uniswap = cfg.uniswap || {};
  cfg.tokens = cfg.tokens || {};

  for (const t of TOKENS) {
    console.log(`\nDeploying ${t.symbol} (${t.name})...`);
    const token = await factory.deploy(t.name, t.symbol);
    await token.waitForDeployment();
    const address = await token.getAddress();
    console.log(`  ${t.symbol} @ ${address}`);

    console.log(`  Minting 1,000,000 ${t.symbol} to deployer...`);
    const tx = await token.mint(deployer.address, MINT_AMOUNT);
    await tx.wait();
    const bal = await token.balanceOf(deployer.address);
    console.log(`  Balance: ${ethers.formatUnits(bal, 18)} ${t.symbol}`);

    cfg.tokens[t.key] = {
      symbol: t.symbol,
      name: t.name,
      address,
      decimals: 18,
    };
  }

  // Flat aliases for older scripts / frontend keys
  cfg.tokens.ghost = cfg.tokens.ghost;
  cfg.uniswap.ghost = cfg.tokens.ghost.address;
  cfg.uniswap.book = cfg.tokens.book.address;
  cfg.uniswap.spark = cfg.tokens.spark.address;
  // legacy key names used in older frontend fields
  cfg.uniswap.pumpaz = cfg.tokens.ghost.address;
  cfg.uniswap.nia = cfg.tokens.book.address;
  cfg.uniswap.wDot = cfg.tokens.spark.address;

  saveConfig(cfg);
  console.log("\nDone. Three mock tokens deployed + minted.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
