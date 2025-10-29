/**
 * Test tick calculation for debugging
 */

function sqrtBigInt(y) {
    if (y < 2n) return y;
    let x0 = y / 2n;
    let x1 = (x0 + y / x0) / 2n;
    while (x1 < x0) {
        [x0, x1] = [x1, (x1 + y / x1) / 2n];
    }
    return x0;
}

function getTickAtSqrtRatio(sqrtPriceX96) {
    const Q96 = 2n ** 96n;

    // price = (sqrtPriceX96 / 2^96)^2
    const sqrtPriceSquared = sqrtPriceX96 * sqrtPriceX96;
    const Q192 = Q96 * Q96;

    const priceFloat = Number(sqrtPriceSquared) / Number(Q192);

    // tick = log(price) / log(1.0001)
    const tick = Math.floor(Math.log(priceFloat) / Math.log(1.0001));

    return tick;
}

// Test case: 1 Token = 0.0001 USDC
// token0 = USDC (6 decimals), token1 = Token (6 decimals)
// price (token1/token0) = 1/0.0001 = 10,000

const targetPrice = 10000; // Token/USDC
const sqrtPriceX96 = BigInt(100) * (2n ** 96n); // sqrt(10000) = 100

console.log("Test: 1 Token = 0.0001 USDC");
console.log("==========================================");
console.log(`Target price (token1/token0): ${targetPrice}`);
console.log(`sqrtPriceX96: ${sqrtPriceX96.toString()}`);

const calculatedTick = getTickAtSqrtRatio(sqrtPriceX96);
console.log(`Calculated tick: ${calculatedTick}`);

// Expected tick ≈ 92103
const expectedTick = Math.floor(Math.log(10000) / Math.log(1.0001));
console.log(`Expected tick: ${expectedTick}`);
console.log(`Match: ${calculatedTick === expectedTick ? '✅' : '❌'}`);

// Test with tick spacing 200 (for 1% fee tier)
const tickSpacing = 200;
const tickLower = Math.floor((calculatedTick - 100 * tickSpacing) / tickSpacing) * tickSpacing;
const tickUpper = Math.floor((calculatedTick + 100 * tickSpacing) / tickSpacing) * tickSpacing;

console.log(`\nWith TICK_RANGE_WIDTH = 100:`);
console.log(`  Tick spacing: ${tickSpacing}`);
console.log(`  tickLower: ${tickLower}`);
console.log(`  tickUpper: ${tickUpper}`);
console.log(`  Range: [${tickLower}, ${tickUpper}]`);

// Verify ticks are within bounds
const MIN_TICK = -887272;
const MAX_TICK = 887272;
console.log(`\nBounds check:`);
console.log(`  tickLower >= MIN_TICK: ${tickLower >= MIN_TICK ? '✅' : '❌'}`);
console.log(`  tickUpper <= MAX_TICK: ${tickUpper <= MAX_TICK ? '✅' : '❌'}`);

