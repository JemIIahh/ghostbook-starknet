import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join(__dirname, "uniswap.config.json");

// Utility: read config
function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  }
  throw new Error("❌ Config file not found. Deploy factory first!");
}

// Utility: save config
function saveConfig(cfg: any) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

async function deployUniswapV3Quoter() {
  console.log("Deploying UniswapV3Quoter Contract...");

  // Load config
  const cfg = loadConfig();

  if (!cfg.uniswap.factory) {
    throw new Error("❌ No factory address found in config. Deploy factory first!");
  }

  // Deploy quoter with factory address
  const ContractName = "UniswapV3Quoter";
  const contract = await ethers.deployContract(ContractName, [cfg.uniswap.factory]);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("Deployed UniswapV3Quoter Contract:", address);

  // Update config
  const network = await ethers.provider.getNetwork();
  cfg.network = "coston2";
  cfg.uniswap.quoter = address;

  saveConfig(cfg);
  console.log("✅ Config updated at:", CONFIG_PATH);
}

async function main() {
  await deployUniswapV3Quoter();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
