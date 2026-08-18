import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join(__dirname, "uniswap.config.json");

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
  }
  return { network: "coston2", uniswap: {} };
}

function saveConfig(cfg: unknown) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

async function main() {
  console.log("Deploying TestUtils...");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log(
    "Balance:",
    ethers.formatEther(await deployer.provider.getBalance(deployer.address)),
    "C2FLR"
  );

  const TestUtils = await ethers.getContractFactory("TestUtils");
  const feeData = await deployer.provider.getFeeData();
  const overrides: {
    gasLimit: bigint;
    gasPrice?: bigint;
    maxFeePerGas?: bigint;
    maxPriorityFeePerGas?: bigint;
  } = { gasLimit: 8_000_000n };

  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    overrides.maxFeePerGas = feeData.maxFeePerGas;
    overrides.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
  } else if (feeData.gasPrice) {
    overrides.gasPrice = feeData.gasPrice;
  }

  const testUtils = await TestUtils.deploy(overrides);
  await testUtils.waitForDeployment();
  const address = await testUtils.getAddress();
  console.log("TestUtils:", address);

  const cfg = loadConfig();
  cfg.network = "coston2";
  cfg.uniswap = cfg.uniswap || {};
  cfg.uniswap.testutils = address;
  saveConfig(cfg);
  console.log("Config updated:", CONFIG_PATH);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
