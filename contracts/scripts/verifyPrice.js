/**
 * 验证Uniswap v4池子初始价格配置
 * 确保sqrtPriceX96计算正确
 */

function calculateSqrtPriceX96(token0Decimals, token1Decimals, token0Amount, token1Amount) {
    // price = token1 / token0 (adjusted for decimals)
    // sqrtPriceX96 = sqrt(price) * 2^96

    const price = (token1Amount / token0Amount) * (10 ** (token0Decimals - token1Decimals));
    const sqrtPrice = Math.sqrt(price);
    const sqrtPriceX96 = BigInt(Math.floor(sqrtPrice * (2 ** 96)));

    return sqrtPriceX96.toString();
}

function main() {
    console.log("🔍 PAYX Price Verification - 20/80 Model\n");

    // ==================== Configuration ====================
    const USDC_DECIMALS = 6;
    const PAYX_DECIMALS = 18;
    const USDC_AMOUNT = 40000;      // 40k USDC for LP
    const PAYX_AMOUNT = 400000000;   // 400M PAYX for LP

    console.log("📋 LP Pool Configuration:");
    console.log("──────────────────────────────────────");
    console.log(`USDC Amount: ${USDC_AMOUNT.toLocaleString()}`);
    console.log(`PAYX Amount: ${PAYX_AMOUNT.toLocaleString()}`);
    console.log(`USDC Decimals: ${USDC_DECIMALS}`);
    console.log(`PAYX Decimals: ${PAYX_DECIMALS}`);
    console.log("──────────────────────────────────────\n");

    // ==================== Calculate Price ====================

    const pricePerToken = USDC_AMOUNT / PAYX_AMOUNT;
    const pricePerMint = pricePerToken * 10000; // 10k tokens per mint

    console.log("💰 Calculated Prices:");
    console.log("──────────────────────────────────────");
    console.log(`Price per PAYX: $${pricePerToken.toFixed(8)} USDC`);
    console.log(`Price per 10,000 PAYX: $${pricePerMint.toFixed(2)} USDC`);
    console.log("──────────────────────────────────────\n");

    // ==================== Expected Values ====================

    const EXPECTED_PRICE = 0.0001;
    const EXPECTED_MINT_PRICE = 1.0;

    console.log("✅ Expected vs Actual:");
    console.log("──────────────────────────────────────");
    console.log(`Expected price per token: $${EXPECTED_PRICE.toFixed(8)}`);
    console.log(`Actual price per token:   $${pricePerToken.toFixed(8)}`);
    console.log(`Match: ${Math.abs(pricePerToken - EXPECTED_PRICE) < 0.00000001 ? "✅ YES" : "❌ NO"}`);
    console.log();
    console.log(`Expected mint price (10k): $${EXPECTED_MINT_PRICE.toFixed(2)}`);
    console.log(`Actual mint price (10k):   $${pricePerMint.toFixed(2)}`);
    console.log(`Match: ${Math.abs(pricePerMint - EXPECTED_MINT_PRICE) < 0.01 ? "✅ YES" : "❌ NO"}`);
    console.log("──────────────────────────────────────\n");

    // ==================== Calculate sqrtPriceX96 ====================

    // Scenario 1: USDC is token0 (USDC < PAYX address)
    console.log("📊 Scenario 1: USDC as token0 (address < PAYX address)");
    const sqrtPriceUSDCFirst = calculateSqrtPriceX96(
        USDC_DECIMALS,
        PAYX_DECIMALS,
        USDC_AMOUNT,
        PAYX_AMOUNT
    );
    console.log(`SQRT_PRICE_PAYMENT_FIRST = "${sqrtPriceUSDCFirst}"`);
    console.log();

    // Scenario 2: PAYX is token0 (PAYX < USDC address)
    console.log("📊 Scenario 2: PAYX as token0 (address < USDC address)");
    const sqrtPriceTokenFirst = calculateSqrtPriceX96(
        PAYX_DECIMALS,
        USDC_DECIMALS,
        PAYX_AMOUNT,
        USDC_AMOUNT
    );
    console.log(`SQRT_PRICE_TOKEN_FIRST = "${sqrtPriceTokenFirst}"`);
    console.log();

    // ==================== Verify Against Deployment Script ====================

    const DEPLOYED_SQRT_PRICE_PAYMENT_FIRST = "7922816251426434139029504";
    const DEPLOYED_SQRT_PRICE_TOKEN_FIRST = "792281625142643375935439503360000";

    console.log("🔍 Verification Against Deployment Script:");
    console.log("──────────────────────────────────────");
    console.log(`Deployed SQRT_PRICE_PAYMENT_FIRST: ${DEPLOYED_SQRT_PRICE_PAYMENT_FIRST}`);
    console.log(`Calculated:                        ${sqrtPriceUSDCFirst}`);
    console.log(`Match: ${sqrtPriceUSDCFirst === DEPLOYED_SQRT_PRICE_PAYMENT_FIRST ? "✅ YES" : "❌ NO"}`);
    console.log();
    console.log(`Deployed SQRT_PRICE_TOKEN_FIRST: ${DEPLOYED_SQRT_PRICE_TOKEN_FIRST}`);
    console.log(`Calculated:                      ${sqrtPriceTokenFirst}`);
    console.log(`Match: ${sqrtPriceTokenFirst === DEPLOYED_SQRT_PRICE_TOKEN_FIRST ? "✅ YES" : "❌ NO"}`);
    console.log("──────────────────────────────────────\n");

    // ==================== Market Cap Calculation ====================

    const TOTAL_SUPPLY = 2000000000; // 2B
    const marketCap = TOTAL_SUPPLY * pricePerToken;

    console.log("📈 Market Metrics:");
    console.log("──────────────────────────────────────");
    console.log(`Total Supply: ${TOTAL_SUPPLY.toLocaleString()} PAYX`);
    console.log(`Initial Price: $${pricePerToken.toFixed(8)}`);
    console.log(`Fully Diluted Market Cap: $${marketCap.toLocaleString()}`);
    console.log();
    console.log(`LP Liquidity: $${USDC_AMOUNT.toLocaleString()} USDC`);
    console.log(`LP as % of Market Cap: ${(USDC_AMOUNT / marketCap * 100).toFixed(2)}%`);
    console.log("──────────────────────────────────────\n");

    // ==================== Summary ====================

    console.log("📝 Summary:");
    console.log("──────────────────────────────────────");
    if (Math.abs(pricePerToken - EXPECTED_PRICE) < 0.00000001 &&
        sqrtPriceUSDCFirst === DEPLOYED_SQRT_PRICE_PAYMENT_FIRST &&
        sqrtPriceTokenFirst === DEPLOYED_SQRT_PRICE_TOKEN_FIRST) {
        console.log("✅ All checks passed!");
        console.log("✅ Initial price: $0.0001 per PAYX");
        console.log("✅ Mint price: $1.00 per mint (10k PAYX)");
        console.log("✅ sqrtPriceX96 values are correct");
        console.log("\n🎉 Ready for deployment!");
    } else {
        console.log("❌ Price configuration has issues!");
        console.log("⚠️  Please review the values above");
    }
    console.log("──────────────────────────────────────\n");

    // ==================== Usage Instructions ====================

    console.log("📖 How to Use:");
    console.log("──────────────────────────────────────");
    console.log("1. Run this script to verify prices:");
    console.log("   node scripts/verifyPrice.js");
    console.log();
    console.log("2. If values don't match, update deployPAYX.js:");
    console.log(`   SQRT_PRICE_PAYMENT_FIRST = "${sqrtPriceUSDCFirst}"`);
    console.log(`   SQRT_PRICE_TOKEN_FIRST = "${sqrtPriceTokenFirst}"`);
    console.log();
    console.log("3. To calculate for different ratios:");
    console.log("   Edit USDC_AMOUNT and PAYX_AMOUNT in this script");
    console.log("──────────────────────────────────────");
}

main();

