/**
 * 计算Uniswap v4 sqrtPriceX96
 * 
 * 用于配置token初始价格
 */

function calculateSqrtPriceX96(token0Decimals, token1Decimals, token0Amount, token1Amount) {
  // price = token1 / token0
  // sqrtPriceX96 = sqrt(price) * 2^96

  const price = (token1Amount / token0Amount) * (10 ** (token0Decimals - token1Decimals));
  const sqrtPrice = Math.sqrt(price);
  const sqrtPriceX96 = BigInt(Math.floor(sqrtPrice * (2 ** 96)));

  return sqrtPriceX96.toString();
}

function main() {
  console.log("🧮 Uniswap v4 SqrtPriceX96 Calculator\n");

  // 示例1: USDC (6 decimals) / Token (18 decimals)
  // 比例: 100,000 USDC : 500,000,000 Token
  console.log("Example 1: USDC (token0) / MyToken (token1)");
  console.log("Ratio: 100,000 USDC : 500,000,000 MyToken");

  const usdcDecimals = 6;
  const tokenDecimals = 18;
  const usdcAmount = 100000;  // 100k USDC
  const tokenAmount = 500000000;  // 500M tokens

  const sqrtPriceUSDCFirst = calculateSqrtPriceX96(
    usdcDecimals,
    tokenDecimals,
    usdcAmount,
    tokenAmount
  );

  console.log(`SQRT_PRICE_PAYMENT_TOKEN_FIRST = "${sqrtPriceUSDCFirst}"`);
  console.log();

  // 示例2: Token (18 decimals) / USDC (6 decimals)
  // 需要反转比例
  console.log("Example 2: MyToken (token0) / USDC (token1)");
  console.log("Ratio: 500,000,000 MyToken : 100,000 USDC");

  const sqrtPriceTokenFirst = calculateSqrtPriceX96(
    tokenDecimals,
    usdcDecimals,
    tokenAmount,
    usdcAmount
  );

  console.log(`SQRT_PRICE_TOKEN_FIRST = "${sqrtPriceTokenFirst}"`);
  console.log();

  // 计算单价
  const pricePerToken = usdcAmount / tokenAmount;
  console.log(`💰 Price per token: $${pricePerToken.toFixed(8)} USDC`);
  console.log(`💰 Price per 10,000 tokens: $${(pricePerToken * 10000).toFixed(2)} USDC`);
  console.log();

  console.log("📝 Usage:");
  console.log("Copy these values to your deployment script:");
  console.log(`const SQRT_PRICE_PAYMENT_FIRST = "${sqrtPriceUSDCFirst}";`);
  console.log(`const SQRT_PRICE_TOKEN_FIRST = "${sqrtPriceTokenFirst}";`);
  console.log();

  console.log("🔧 Custom Calculation:");
  console.log("Modify the values in this script and run:");
  console.log("node contracts/scripts/calculateSqrtPrice.js");
}

main();

