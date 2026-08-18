import { ethers } from "hardhat";
import { expect } from "chai";

describe("UniswapV3 Quotation Test", function () {
  async function deployUniswapV3Fixture() {
    const [deployer] = await ethers.getSigners();

    // 1. Deploy ERC20 tokens
    const ERC20 = await ethers.getContractFactory("MockToken");
    const token0 = await ERC20.deploy("Token0", "T0");
    const token1 = await ERC20.deploy("Token1", "T1");
    const token2 = await ERC20.deploy("Token2", "T2");

    await token0.mint(deployer.address, ethers.parseEther("1000"));
    await token1.mint(deployer.address, ethers.parseEther("1000"));
    await token2.mint(deployer.address, ethers.parseEther("1000"));

    // 2. Deploy Uniswap V3 Factory
    const UniswapV3Factory = await ethers.getContractFactory("UniswapV3Factory");
    const factory = await UniswapV3Factory.deploy();

    // 3. Deploy NonfungiblePositionManager
    const Manager = await ethers.getContractFactory("UniswapV3Manager");
    const manager = await Manager.deploy(factory.target);

    // 4. Deploy Quoter contract
    const Quoter = await ethers.getContractFactory("UniswapV3Quoter");
    const quoter = await Quoter.deploy(factory.target);

    // 5. Deploy TestUtils
    const TestUtils = await ethers.getContractFactory("TestUtils");
    const testUtils = await TestUtils.deploy();


    // console.log("Contracts deployed:"); console.log("Token0:", token0.target); console.log("Token1:", token1.target); console.log("Token2:", token2.target); console.log("Factory:", factory.target); console.log("Manager:", manager.target); console.log("Quoter:", quoter.target); console.log("TestUtils", testUtils.target);

    // ==========================================================
    // Pool 1: token0-token1 (sqrtPrice = 5000)
    // ==========================================================
    const fee = 3000;
    const sqrtPrice01 = await testUtils.sqrtP(5000);

    await factory.createPool(token0.target, token1.target, fee);
    const pool01Addr = await factory.pools(token0.target, token1.target, fee);
    const pool01 = await ethers.getContractAt("UniswapV3Pool", pool01Addr);
    await pool01.initialize(sqrtPrice01);

    // Provide liquidity to pool0-1
    const amount0 = ethers.parseEther("50");
    const amount1 = ethers.parseEther("50");
    await token0.approve(manager.target, amount0);
    await token1.approve(manager.target, amount1);

    const mintParams01 = await testUtils.mintParams(
      token0.target,
      token1.target,
      4545,
      5500,
      amount0,
      amount1
    );

    await manager.mint({
      tokenA: mintParams01[0],
      tokenB: mintParams01[1],
      fee: mintParams01[2],
      lowerTick: mintParams01[3],
      upperTick: mintParams01[4],
      amount0Desired: mintParams01[5],
      amount1Desired: mintParams01[6],
      amount0Min: mintParams01[7],
      amount1Min: mintParams01[8],
    });

    // ==========================================================
    // Pool 2: token1-token2 (sqrtPrice = 10)
    // ==========================================================
    const sqrtPrice12 = await testUtils.sqrtP(10);

    await factory.createPool(token1.target, token2.target, fee);
    const pool12Addr = await factory.pools(token1.target, token2.target, fee);
    const pool12 = await ethers.getContractAt("UniswapV3Pool", pool12Addr);
    await pool12.initialize(sqrtPrice12);

    // Provide liquidity to pool1-2
    const amount1b = ethers.parseEther("10");
    const amount2 = ethers.parseEther("10");
    await token1.approve(manager.target, amount1b);
    await token2.approve(manager.target, amount2);

    const mintParams12 = await testUtils.mintParams(
      token1.target,
      token2.target,
      7,
      13,
      amount1b,
      amount2
    );

    await manager.mint({
      tokenA: mintParams12[0],
      tokenB: mintParams12[1],
      fee: mintParams12[2],
      lowerTick: mintParams12[3],
      upperTick: mintParams12[4],
      amount0Desired: mintParams12[5],
      amount1Desired: mintParams12[6],
      amount0Min: mintParams12[7],
      amount1Min: mintParams12[8],
    });

    console.log("Pool Balance Token0:", ethers.formatEther(await token0.balanceOf(pool01.target)))
    console.log("Pool Balance Token1:", ethers.formatEther(await token1.balanceOf(pool01.target)))

    return { deployer, token0, token1, token2, factory, manager, quoter, testUtils, pool01, pool12 };
  }

  describe("Quote Tests", function () {
    it("Should correctly quote token1 output for token0 input in pool0-1", async function () {
      const { token0, token1, testUtils, quoter } = await deployUniswapV3Fixture();
      const amountIn = ethers.parseEther("10");
      const sqrtLimit = await testUtils.sqrtP(4993);
      const [amountOut, sqrtPriceAfter, tickAfter] = await quoter.quoteSingle.staticCall({
        tokenIn: token0.target,
        tokenOut: token1.target,
        fee: 3000,
        amountIn,
        sqrtPriceLimitX96: sqrtLimit,
      });

      console.log("Quote token0 -> token1:");
      console.log("amountOut:", ethers.formatEther(amountOut));
      console.log("sqrtPriceAfter:", sqrtPriceAfter.toString());
      console.log("tickAfter:", tickAfter);

      expect(amountOut).to.be.gt(0n);
    });

    it("Should correctly quote token2 output for token1 input in pool1-2", async function () {
      const { token1, token2, testUtils, quoter } = await deployUniswapV3Fixture();
      const amountIn = ethers.parseEther("10");
      const sqrtLimit = await testUtils.sqrtP(13);

      const [amountOut, sqrtPriceAfter, tickAfter] = await quoter.quoteSingle.staticCall({
        tokenIn: token1.target,
        tokenOut: token2.target,
        fee: 3000,
        amountIn,
        sqrtPriceLimitX96: sqrtLimit,
      });

      console.log("Quote token1 -> token2:");
      console.log("amountOut:", ethers.formatEther(amountOut));
      console.log("sqrtPriceAfter:", sqrtPriceAfter.toString());
      console.log("tickAfter:", tickAfter);
    });

    it("Swaps tokens in pool 1", async function () {
      const { token0, token1, testUtils, manager, pool01, deployer } = await deployUniswapV3Fixture();
      const swapAmount = ethers.parseEther("1");
    
      // Approve input token for manager
      await token0.approve(manager.target, swapAmount);
    
      const slot0 = await pool01.slot0();
      const currentSqrtPriceX96 = slot0[0];
    
      const sqrtLimit = currentSqrtPriceX96 - 1n; // token0 -> token1
    
      const params = {
        tokenIn: token1.target,
        tokenOut: token0.target,
        fee: 3000,
        amountIn: swapAmount,
        sqrtPriceLimitX96: sqrtLimit
      };
    
      const tx = await manager.swapSingle(params);
      await tx.wait();
    
      console.log("Swap successful!");
      console.log("User Balance Token0", ethers.formatEther(await token0.balanceOf(deployer.address)));
      console.log("User Balance Token1", ethers.formatEther(await token1.balanceOf(deployer.address)));
    });
  
  });
});
