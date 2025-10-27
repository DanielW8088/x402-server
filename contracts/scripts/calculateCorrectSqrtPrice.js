const { ethers } = require("ethers");

/**
 * Calculate correct sqrtPriceX96 for token/USDC pair
 * 
 * Important: 
 * - USDC has 6 decimals
 * - Token has 18 decimals
 * - Price in Uniswap = amount1 / amount0 (in wei)
 */

// Example: 1 USDC buys 1000 tokens
const PRICE_USDC = 1; // 1 USDC
const TOKENS_PER_MINT = 1000; // 1000 tokens

// Price per token in USDC
const pricePerToken = PRICE_USDC / TOKENS_PER_MINT; // 0.001 USDC per token

console.log(`\n💰 Price Calculation:`);
console.log(`   ${TOKENS_PER_MINT} tokens = ${PRICE_USDC} USDC`);
console.log(`   1 token = ${pricePerToken} USDC`);
console.log(`   1 USDC = ${1 / pricePerToken} tokens\n`);

// In wei terms:
// 1 token = 1e18 wei
// 1 USDC = 1e6 wei
// If 1 token = 0.001 USDC:
// 1e18 wei of token = 0.001 * 1e6 wei of USDC = 1e3 wei of USDC

const tokenWei = ethers.parseEther("1"); // 1e18
const usdcWeiPerToken = ethers.parseUnits(pricePerToken.toString(), 6);

console.log(`🔢 Wei Conversion:`);
console.log(`   1 token = ${tokenWei} wei`);
console.log(`   Price per token = ${usdcWeiPerToken} wei of USDC`);

// Uniswap price calculation depends on token order
// Let's calculate for both scenarios

console.log(`\n📊 Scenario 1: USDC is token0, Token is token1`);
// price = token1 / token0 = (1e18 wei of token) / (1e3 wei of USDC) = 1e15
let price1 = Number(tokenWei) / Number(usdcWeiPerToken);
console.log(`   price = ${price1} = ${price1.toExponential()}`);
let sqrtPrice1 = Math.sqrt(price1);
console.log(`   sqrtPrice = ${sqrtPrice1.toExponential()}`);
let sqrtPriceX96_1 = BigInt(Math.floor(sqrtPrice1 * (2 ** 96)));
console.log(`   sqrtPriceX96 = ${sqrtPriceX96_1.toString()}`);

console.log(`\n📊 Scenario 2: Token is token0, USDC is token1`);
// price = token1 / token0 = (1e3 wei of USDC) / (1e18 wei of token) = 1e-15
let price2 = Number(usdcWeiPerToken) / Number(tokenWei);
console.log(`   price = ${price2} = ${price2.toExponential()}`);
let sqrtPrice2 = Math.sqrt(price2);
console.log(`   sqrtPrice = ${sqrtPrice2.toExponential()}`);
let sqrtPriceX96_2 = BigInt(Math.floor(sqrtPrice2 * (2 ** 96)));
console.log(`   sqrtPriceX96 = ${sqrtPriceX96_2.toString()}`);

console.log(`\n✅ Use these values in deployment:`);
console.log(`   sqrtPricePaymentFirst (USDC < Token): ${sqrtPriceX96_1.toString()}`);
console.log(`   sqrtPriceTokenFirst (Token < USDC): ${sqrtPriceX96_2.toString()}`);

// Compare with old values
console.log(`\n🔍 Old values (for comparison):`);
console.log(`   sqrtPricePaymentFirst: 7922816251426434139029504`);
console.log(`   sqrtPriceTokenFirst: 792281625142643375935439503360000`);

