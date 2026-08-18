import { ethers } from "hardhat";
import config from "../config";

async function addLiquidityPool() {
  const CONTRACT_NAME = "UniswapV3Manager";
  const UTILS_CONTRACT_NAME = "TestUtils";
  const TOKEN_NAME = "MockToken";

  const tokenA = config.usdtg;
  const tokenB = config.wstt;
  const managerAddress = config.managerAddress;

  const sender = new ethers.Wallet(
    process.env.DEPLOYER_ACCOUNT_PRIV_KEY as string,
    ethers.provider
  );

  console.log("Deployer address:", sender.address);

  // === Get token contracts ===
  const usdtg = await ethers.getContractAt(TOKEN_NAME, tokenA, sender);
  const wstt = await ethers.getContractAt(TOKEN_NAME, tokenB, sender);

  // === Get manager and utils contracts ===
  const manager = await ethers.getContractAt(CONTRACT_NAME, managerAddress, sender);
  const utilsContract = await ethers.getContractAt(UTILS_CONTRACT_NAME, config.testutils, sender);

  // === Balances before ===
  const balance0Before = await usdtg.balanceOf(sender.address);
  const balance1Before = await wstt.balanceOf(sender.address);

  console.log("Balances before mint:");
  console.log("USDTG:", ethers.formatEther(balance0Before));
  console.log("WSTT :", ethers.formatEther(balance1Before));

  // === Approve manager for max allowance ===
  await (await usdtg.approve(managerAddress, ethers.MaxUint256)).wait();
  await (await wstt.approve(managerAddress, ethers.MaxUint256)).wait();
  console.log("✅ Approved manager for max allowance.");

  // === Build mint params from utils ===
  const mintParams = await utilsContract.mintParams(
    tokenB,
    tokenA,
    4545,        
    5500,          
    ethers.parseEther("1"), // amount0Desired
    ethers.parseEther("1")  // amount1Desired
  );

  console.log("Mint parameters:", mintParams);

  // // === Call mint ===
  const tx = await manager.connect(sender).mint({
    tokenA: mintParams[0],
    tokenB: mintParams[1],
    fee: mintParams[2],
    lowerTick: mintParams[3],
    upperTick: mintParams[4],
    amount0Desired: mintParams[5],
    amount1Desired: mintParams[6],
    amount0Min: mintParams[7],
    amount1Min: mintParams[8],
  });

  const receipt = await tx.wait();
  console.log("✅ Minted liquidity, tx hash:", receipt.hash);

  // === Balances after ===
  const balance0After = await usdtg.balanceOf(sender.address);
  const balance1After = await wstt.balanceOf(sender.address);

  const poolAddress = config.pools[0]["usdtg/wstt"];
  const balance0Pool = await usdtg.balanceOf(poolAddress);
  const balance1Pool = await wstt.balanceOf(poolAddress);

  console.log("Balances after mint:");
  console.log("USDTG:", ethers.formatEther(balance0After));
  console.log("WSTT :", ethers.formatEther(balance1After));

  console.log("Pool USDTG:", ethers.formatEther(balance0Pool));
  console.log("Pool WSTT :", ethers.formatEther(balance1Pool));
}

async function main() {
  await addLiquidityPool();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
