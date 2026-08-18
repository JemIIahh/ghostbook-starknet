export const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function mint(address to, uint256 amount)",
];

export const FAUCET_ABI = [
  "function drip()",
  "function dripTo(address to)",
  "function mint(address token, address to, uint256 amount)",
  "function ghost() view returns (address)",
  "function book() view returns (address)",
  "function spark() view returns (address)",
];

export const FACTORY_ABI = [
  "function createPool(address tokenX, address tokenY, uint24 fee) returns (address pool)",
  "function pools(address tokenX, address tokenY, uint24 fee) view returns (address pool)",
];

export const MANAGER_ABI = [
  "function mint((address tokenA,address tokenB,uint24 fee,int24 lowerTick,int24 upperTick,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min)) returns (uint256 amount0,uint256 amount1)",
  "function swapSingle((address tokenIn,address tokenOut,uint24 fee,uint256 amountIn,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut)",
];

export const QUOTER_ABI = [
  "function quoteSingle((address tokenIn,address tokenOut,uint24 fee,uint256 amountIn,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,int24 tickAfter)",
];

export const TESTUTILS_ABI = [
  "function deployPool(address factory,address token0,address token1,uint24 fee,uint256 currentPrice) returns (address pool)",
];

export const POOL_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
  "function tickSpacing() view returns (uint24)",
  "function liquidity() view returns (uint128)",
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext)",
  "function burn(int24 lowerTick, int24 upperTick, uint128 amount) returns (uint256 amount0, uint256 amount1)",
  "function collect(address recipient, int24 lowerTick, int24 upperTick, uint128 amount0Requested, uint128 amount1Requested) returns (uint128 amount0, uint128 amount1)",
];
