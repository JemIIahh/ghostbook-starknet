import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join(__dirname, "uniswap.config.json");

// Utility: read config or create default
function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  }
  return {
    network: "coston2",
    uniswap: {},
  };
}

// Utility: save config
function saveConfig(cfg: any) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

async function deployUniswapV3Manager() {
  console.log("Deploying UniswapV3Manager Contract...");

  // Load config
  const cfg = loadConfig();

  if (!cfg.uniswap.factory) {
    throw new Error("❌ No factory address found in config. Deploy factory first!");
  }

  // Deploy manager using factory address from config
  const ContractName = "UniswapV3Manager";
  const contract = await ethers.deployContract(ContractName, [cfg.uniswap.factory]);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log("Deployed UniswapV3Manager Contract:", address);

  // Update config
  const network = await ethers.provider.getNetwork();
  cfg.network = "coston2";
  cfg.uniswap.manager = address;

  saveConfig(cfg);
  console.log("✅ Config updated at:", CONFIG_PATH);
}

async function main() {
  await deployUniswapV3Manager();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
