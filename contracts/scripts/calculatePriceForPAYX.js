/**
 * 为PAYX计算正确的sqrtPriceX96
 * 20/80配置：40k USDC : 400M PAYX
 */

function calculateSqrtPriceX96Precise(usdcAmount, payxAmount) {
    // Uniswap v4 price formula:
    // price = (amount1 / 10^decimals1) / (amount0 / 10^decimals0)
    // sqrtPriceX96 = sqrt(price) * 2^96

    // For USDC (6 decimals) and PAYX (18 decimals):
    // price = (PAYX / 10^18) / (USDC / 10^6) = PAYX / USDC * 10^(-12)

    const USDC_DECIMALS = 6;
    const PAYX_DECIMALS = 18;

    // When USDC is token0 (smaller address):
    // price = PAYX / USDC adjusted by decimals
    const priceWhenUSDCFirst = (payxAmount / usdcAmount) * Math.pow(10, USDC_DECIMALS - PAYX_DECIMALS);
    const sqrtPriceWhenUSDCFirst = Math.sqrt(priceWhenUSDCFirst);
    const sqrtPriceX96WhenUSDCFirst = BigInt(Math.floor(sqrtPriceWhenUSDCFirst * Math.pow(2, 96)));

    // When PAYX is token0 (smaller address):
    // price = USDC / PAYX adjusted by decimals
    const priceWhenPAYXFirst = (usdcAmount / payxAmount) * Math.pow(10, PAYX_DECIMALS - USDC_DECIMALS);
    const sqrtPriceWhenPAYXFirst = Math.sqrt(priceWhenPAYXFirst);
    const sqrtPriceX96WhenPAYXFirst = BigInt(Math.floor(sqrtPriceWhenPAYXFirst * Math.pow(2, 96)));

    return {
        usdcFirst: sqrtPriceX96WhenUSDCFirst.toString(),
        payxFirst: sqrtPriceX96WhenPAYXFirst.toString(),
        pricePerPAYX: usdcAmount / payxAmount
    };
}

function main() {
    console.log("🧮 PAYX sqrtPriceX96 Calculator\n");

    // 20/80 Configuration
    const USDC_AMOUNT = 40000;      // 40k USDC
    const PAYX_AMOUNT = 400000000;  // 400M PAYX

    console.log("📋 Configuration:");
    console.log("──────────────────────────────────────");
    console.log(`USDC for LP: ${USDC_AMOUNT.toLocaleString()}`);
    console.log(`PAYX for LP: ${PAYX_AMOUNT.toLocaleString()}`);
    console.log("──────────────────────────────────────\n");

    const result = calculateSqrtPriceX96Precise(USDC_AMOUNT, PAYX_AMOUNT);

    console.log("💰 Price Information:");
    console.log("──────────────────────────────────────");
    console.log(`Price per PAYX: $${result.pricePerPAYX.toFixed(8)}`);
    console.log(`Price per 10k PAYX: $${(result.pricePerPAYX * 10000).toFixed(2)}`);
    console.log("──────────────────────────────────────\n");

    console.log("📊 sqrtPriceX96 Values:");
    console.log("──────────────────────────────────────");
    console.log("When USDC address < PAYX address (USDC is token0):");
    console.log(`SQRT_PRICE_PAYMENT_FIRST = "${result.usdcFirst}"`);
    console.log();
    console.log("When PAYX address < USDC address (PAYX is token0):");
    console.log(`SQRT_PRICE_TOKEN_FIRST = "${result.payxFirst}"`);
    console.log("──────────────────────────────────────\n");

    console.log("📝 Copy to deployPAYX.js:");
    console.log("──────────────────────────────────────");
    console.log(`const SQRT_PRICE_PAYMENT_FIRST = "${result.usdcFirst}";`);
    console.log(`const SQRT_PRICE_TOKEN_FIRST = "${result.payxFirst}";`);
    console.log("──────────────────────────────────────\n");

    // Verify
    console.log("✅ Verification:");
    console.log(`Target price: $0.0001 per PAYX`);
    console.log(`Actual price: $${result.pricePerPAYX.toFixed(8)} per PAYX`);
    console.log(`Match: ${Math.abs(result.pricePerPAYX - 0.0001) < 0.00000001 ? "✅" : "❌"}`);
    console.log();
    console.log(`Target mint cost: $1.00 for 10k PAYX`);
    console.log(`Actual mint cost: $${(result.pricePerPAYX * 10000).toFixed(2)} for 10k PAYX`);
    console.log(`Match: ${Math.abs(result.pricePerPAYX * 10000 - 1.0) < 0.01 ? "✅" : "❌"}`);
}

main();

