import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join(__dirname, "uniswap.config.json");

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error("Missing uniswap.config.json");
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
}

function saveConfig(cfg: unknown) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

async function main() {
  const config = loadConfig();
  const ghost = config.uniswap?.ghost || config.tokens?.ghost?.address;
  const book = config.uniswap?.book || config.tokens?.book?.address;
  const spark = config.uniswap?.spark || config.tokens?.spark?.address;

  if (!ghost || !book || !spark) {
    throw new Error("Missing ghost/book/spark addresses in config");
  }

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("GHOST:", ghost);
  console.log("BOOK:", book);
  console.log("SPARK:", spark);

  const Faucet = await ethers.getContractFactory("GhostFaucet");
  const faucet = await Faucet.deploy(ghost, book, spark);
  await faucet.waitForDeployment();
  const faucetAddress = await faucet.getAddress();
  console.log("GhostFaucet:", faucetAddress);

  // Transfer MockToken ownership so faucet can mint
  for (const [name, addr] of [
    ["GHOST", ghost],
    ["BOOK", book],
    ["SPARK", spark],
  ] as const) {
    const token = await ethers.getContractAt("MockToken", addr, deployer);
    const owner = await token.owner();
    console.log(`${name} owner:`, owner);
    if (owner.toLowerCase() !== deployer.address.toLowerCase()) {
      console.warn(`⚠️  ${name} not owned by deployer — skip transferOwnership`);
      continue;
    }
    const tx = await token.transferOwnership(faucetAddress);
    await tx.wait();
    console.log(`✅ ${name} ownership → faucet`);
  }

  config.uniswap = {
    ...(config.uniswap || {}),
    faucet: faucetAddress,
  };
  saveConfig(config);
  console.log("Saved faucet to uniswap.config.json");
  console.log("Update src/lib/uniswapConfig.ts faucet:", faucetAddress);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
