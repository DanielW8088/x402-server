#!/usr/bin/env -S npx tsx
/**
 * Test script to debug price calculation
 * Usage: npx tsx test-price-calc.ts <mintAmount>
 */

import { formatUnits } from "viem";

function sqrtBigInt(y: bigint): bigint {
  if (y < 2n) return y;
  let x0 = y / 2n;
  let x1 = (x0 + y / x0) / 2n;
  while (x1 < x0) {
    [x0, x1] = [x1, (x1 + y / x1) / 2n];
  }
  return x0;
}

function calculateSqrtPriceX96(
  priceToken1PerToken0: number,
  decimals0: number,
  decimals1: number
): bigint {
  console.log(`\n[calculateSqrtPriceX96]`);
  console.log(`  Input price: ${priceToken1PerToken0}`);
  console.log(`  decimals0: ${decimals0}, decimals1: ${decimals1}`);

  if (priceToken1PerToken0 <= 0 || !isFinite(priceToken1PerToken0)) {
    throw new Error(`Invalid price: ${priceToken1PerToken0}`);
  }

  let priceStr = priceToken1PerToken0.toPrecision(15);
  console.log(`  toPrecision(15): ${priceStr}`);
  
  if (priceStr.includes('e')) {
    const [base, exp] = priceStr.split('e');
    const exponent = parseInt(exp);
    const numStr = base.replace('.', '');
    const decimalPlaces = base.split('.')[1]?.length || 0;
    
    if (exponent >= 0) {
      const zerosToAdd = exponent - decimalPlaces;
      priceStr = zerosToAdd >= 0 
        ? numStr + '0'.repeat(zerosToAdd)
        : numStr.slice(0, numStr.length + zerosToAdd) + '.' + numStr.slice(numStr.length + zerosToAdd);
    } else {
      const zerosToAdd = Math.abs(exponent) - 1;
      priceStr = '0.' + '0'.repeat(zerosToAdd) + numStr;
    }
  }
  
  console.log(`  normalized: ${priceStr}`);
  
  const parts = priceStr.split('.');
  const integerPart = parts[0] || '0';
  const decimalPart = parts[1] || '0';
  
  const fullDecimal = (decimalPart + '0'.repeat(18)).slice(0, 18);
  const numerator = BigInt(integerPart + fullDecimal);
  const denominator = 10n ** 18n;
  
  console.log(`  numerator: ${numerator.toString()}`);
  console.log(`  denominator: ${denominator.toString()}`);
  
  if (numerator <= 0n) {
    throw new Error(`numerator is 0!`);
  }

  const Q96 = 2n ** 96n;
  const numeratorScaled = numerator * (Q96 ** 2n);
  const sqrtNumerator = sqrtBigInt(numeratorScaled);
  const sqrtDenominator = sqrtBigInt(denominator);
  const sqrtPriceX96 = sqrtNumerator / sqrtDenominator;
  
  console.log(`  sqrtPriceX96: ${sqrtPriceX96.toString()}`);

  return sqrtPriceX96;
}

// Main
const mintAmountRaw = process.argv[2] || "10000000000"; // 10,000 with 6 decimals
const mintAmount = BigInt(mintAmountRaw);
const TOKEN_DECIMALS = 6;

console.log(`Testing with MINT_AMOUNT: ${mintAmountRaw}`);
console.log(`Formatted: ${formatUnits(mintAmount, TOKEN_DECIMALS)}`);

const mintAmountFloat = parseFloat(formatUnits(mintAmount, TOKEN_DECIMALS));
console.log(`Float: ${mintAmountFloat}`);

if (mintAmountFloat === 0 || mintAmount === 0n) {
  console.error("ERROR: MINT_AMOUNT is zero!");
  process.exit(1);
}

const pricePerToken = 1.0 / mintAmountFloat;
console.log(`Price per token: ${pricePerToken}`);
console.log(`Price per token (scientific): ${pricePerToken.toExponential(10)}`);

// Test both orderings
console.log(`\n=== Test 1: token0=USDC, token1=Token ===`);
const price1 = 1.0 / pricePerToken;
console.log(`priceToken1PerToken0: ${price1}`);
try {
  const sqrt1 = calculateSqrtPriceX96(price1, 6, 6);
  console.log(`✅ SUCCESS: ${sqrt1.toString()}`);
} catch (e: any) {
  console.error(`❌ FAILED: ${e.message}`);
}

console.log(`\n=== Test 2: token0=Token, token1=USDC ===`);
const price2 = pricePerToken;
console.log(`priceToken1PerToken0: ${price2}`);
try {
  const sqrt2 = calculateSqrtPriceX96(price2, 6, 6);
  console.log(`✅ SUCCESS: ${sqrt2.toString()}`);
} catch (e: any) {
  console.error(`❌ FAILED: ${e.message}`);
}

