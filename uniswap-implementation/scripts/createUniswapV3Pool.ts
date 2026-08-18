import { ethers } from "hardhat";
import fs from "fs";
import path from "path";

const CONFIG_PATH = path.join(__dirname, "uniswap.config.json");

// read config
function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
}

// replacer for BigInt
function replacer(_key: string, value: any) {
  return typeof value === "bigint" ? value.toString() : value;
}

// save config
function saveConfig(updatedConfig: any) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(updatedConfig, replacer, 2));
  console.log("✅ Config updated at:", CONFIG_PATH);
}

async function createPool() {
  const config = loadConfig();

  const CONTRACT_NAME = "UniswapV3Factory";
  const UTILS_CONTRACT_NAME = "TestUtils";

  // ✅ Updated token list
  const tokens: Record<string, string> = {
    GHOST: "0x1daBC80337bF2d85d496c4eD9cE63a1b16Fbd539",
    BOOK: "0x284E2F5585eAb8860b6b541e561a4F3aC98DCC08",
    SPARK: "0xcf2dfCa5804a0f32D8bB233dF0898B8238b40658",
    USDT0: "0xC1A5B41512496B80903D1f32d6dEa3a73212E71F",
    FXRP: "0x0b6A3645c240605887a5532109323A3E12273dc7",
    WC2FLR: "0xC67DCE33D7A8efA5FfEB961899C73fe01bCe9273",
  };

  // SELECT TOKENS HERE
  const token0Symbol = "GHOST";
  const token1Symbol = "BOOK";

  if (!tokens[token0Symbol] || !tokens[token1Symbol]) {
    throw new Error("❌ Invalid token symbols selected");
  }

  let token0 = tokens[token0Symbol];
  let token1 = tokens[token1Symbol];

  // ✅ IMPORTANT: sort tokens (Uniswap requires token0 < token1)
  if (token0.toLowerCase() > token1.toLowerCase()) {
    [token0, token1] = [token1, token0];
  }

  const poolName = `${token0Symbol}-${token1Symbol}`;

  if (!config.uniswap?.factory || !config.uniswap?.testutils) {
    throw new Error("❌ Missing Uniswap config (factory/testutils)");
  }

  const factoryAddress = config.uniswap.factory;
  const fee = 3000;
  const initPrice = 5000;

  const sender = new ethers.Wallet(
    process.env.PRIVATE_KEY as string,
    ethers.provider
  );

  console.log("Deployer address:", sender.address);

  const factoryContract = await ethers.getContractAt(
    CONTRACT_NAME,
    factoryAddress,
    sender
  );

  const utilsContract = await ethers.getContractAt(
    UTILS_CONTRACT_NAME,
    config.uniswap.testutils,
    sender
  );

  // check if pool exists
  let poolAddress = await factoryContract.pools(token0, token1, fee);
  let poolInstance;

  if (poolAddress !== ethers.ZeroAddress) {
    console.log(`✅ Pool already exists at: ${poolAddress}`);

    poolInstance = await ethers.getContractAt(
      "UniswapV3Pool",
      poolAddress,
      sender
    );

    const slot0 = await poolInstance.slot0();

    if (slot0.sqrtPriceX96 === 0n) {
      let sqrtPrice = await utilsContract.sqrtP(initPrice);
      console.log("Initializing pool with sqrtPrice:", sqrtPrice.toString());

      let tx = await poolInstance.initialize(sqrtPrice);
      await tx.wait();

      console.log("Transaction sent:", tx.hash);
    }
  } else {
    console.log("⏳ Pool not found, creating new pool...");

    const tx = await factoryContract.createPool(token0, token1, fee);
    console.log("Transaction sent:", tx.hash);

    const receipt = await tx.wait();
    console.log("📦 Tx confirmed in block:", receipt.blockNumber);

    poolAddress = await factoryContract.pools(token0, token1, fee);
    console.log("🎉 New Pool Address:", poolAddress);

    poolInstance = await ethers.getContractAt(
      "UniswapV3Pool",
      poolAddress,
      sender
    );

    let sqrtPrice = await utilsContract.sqrtP(initPrice);
    console.log("Initializing pool with sqrtPrice:", sqrtPrice.toString());

    let poolTx = await poolInstance.initialize(sqrtPrice);
    await poolTx.wait();
  }

  // fetch slot0 details
  const slot0 = await poolInstance.slot0();
  console.log("📊 Slot0 details:", slot0);

  // update config
  const updatedConfig = {
    ...config,
    pools: {
      ...(config.pools || {}),
      [poolName]: {
        address: poolAddress,
        token0,
        token1,
        fee,
        slot0: {
          sqrtPriceX96: slot0[0].toString(),
          tick: slot0[1].toString(),
          observationIndex: slot0[2].toString(),
          observationCardinality: slot0[3].toString(),
          observationCardinalityNext: slot0[4].toString(),
        },
        timestamp: Date.now(),
      },
    },
  };

  saveConfig(updatedConfig);
}

async function main() {
  await createPool();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});