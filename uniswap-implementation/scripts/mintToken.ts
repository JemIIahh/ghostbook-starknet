/**
 * Mint MockToken balance to an address (owner only).
 *
 * Usage:
 *   TOKEN=GHOST AMOUNT=10000 TO=0x... npx hardhat run scripts/mintToken.ts --network coston2
 */
import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join(__dirname, "uniswap.config.json");

async function main() {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  const symbol = (process.env.TOKEN || "GHOST").toUpperCase();
  const amountStr = process.env.AMOUNT || "1000000";

  const entry = Object.values(cfg.tokens || {}).find(
    (t: unknown) => (t as { symbol: string }).symbol === symbol
  ) as { address: string; symbol: string; decimals: number } | undefined;

  if (!entry?.address) {
    throw new Error(
      `Unknown TOKEN=${symbol}. Available: ${Object.values(cfg.tokens || {})
        .map((t: unknown) => (t as { symbol: string }).symbol)
        .join(", ")}`
    );
  }

  const [admin] = await ethers.getSigners();
  const to = process.env.TO || admin.address;
  const amount = ethers.parseUnits(amountStr, entry.decimals ?? 18);

  console.log("Minting", amountStr, entry.symbol, "→", to);
  const token = await ethers.getContractAt("MockToken", entry.address);
  const tx = await token.mint(to, amount);
  await tx.wait();
  console.log("Tx:", tx.hash);
  console.log(
    "New balance:",
    ethers.formatUnits(await token.balanceOf(to), entry.decimals ?? 18),
    entry.symbol
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
