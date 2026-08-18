import { ethers } from "hardhat";
import config from "../config";

async function quoteSwap(tokenIn: string, tokenOut: string, amountIn: bigint) {
  const QUOTER_NAME = "UniswapV3Quoter";
  const UTILS_CONTRACT_NAME = "TestUtils";
  const TOKEN_NAME = "MockToken";
  const fee = 3000; // 0.3% pool fee

  const quoterAddress = config.quoterAddress;
  const testAddress = config.testutils;

  const sender = new ethers.Wallet(
    process.env.PRIVATE_KEY as string,
    ethers.provider
  );

  console.log("Deployer address:", sender.address);

  // Attach contracts
  const tokenInContract = await ethers.getContractAt(TOKEN_NAME, tokenIn, sender);
  const tokenOutContract = await ethers.getContractAt(TOKEN_NAME, tokenOut, sender);
  const utilsContract = await ethers.getContractAt(UTILS_CONTRACT_NAME, testAddress, sender);
  const quoter = await ethers.getContractAt(QUOTER_NAME, quoterAddress, sender);

  // Calculate initial sqrtPrice (example: pool with 5000 price)
  const sqrtPrice = await utilsContract.sqrtP(4545);

  // Build params
  const params = {
    tokenIn,
    tokenOut,
    fee,
    amountIn,
    sqrtPriceLimitX96: sqrtPrice,
  };

  console.log(`Quote params for ${tokenIn} -> ${tokenOut}:`, params);

  try {
    // Simulate quoteSingle
    const result = await quoter.quoteSingle.staticCall(params);
    console.log(`Quote result ${tokenIn} -> ${tokenOut}:`, result);
  } catch (error: any) {
    if (error?.data) {
      const [amountOut, sqrtPriceX96After, tickAfter] = ethers.AbiCoder.defaultAbiCoder().decode(
        ["uint256", "uint160", "int24"],
        error.data
      );
      console.log(`Decoded result ${tokenIn} -> ${tokenOut}:`);
      console.log("AmountOut:", amountOut.toString());
      console.log("SqrtPriceX96After:", sqrtPriceX96After.toString());
      console.log("TickAfter:", tickAfter.toString());
    } else {
      console.error("Unexpected error:", error);
    }
  }
}

async function main() {
  const tokenA = config.usdtg;
  const tokenB = config.wstt;
  const amount = ethers.parseEther("1"); // 1 token

  console.log("=== TokenA -> TokenB ===");
  await quoteSwap(tokenA, tokenB, amount);

  console.log("\n=== TokenB -> TokenA ===");
  await quoteSwap(tokenB, tokenA, amount);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
