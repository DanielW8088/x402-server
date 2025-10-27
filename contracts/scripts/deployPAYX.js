const hre = require("hardhat");

/**
 * PAYX deployment script
 * Full Uniswap v4 integration + EIP-3009 support
 */

async function main() {
    console.log("🚀 Deploying PAYX contract...\n");

    // ==================== Configuration ====================

    // Token config
    const TOKEN_NAME = "PAYX";
    const TOKEN_SYMBOL = "PAYX";
    const MINT_AMOUNT = hre.ethers.parseEther("10000"); // 10k tokens per payment
    const MAX_MINT_COUNT = 100000; // 100k mints by users = 1B, LP gets 1B pre-minted = 2B total

    // Uniswap v4 addresses (Base Sepolia)
    const POOL_MANAGER = "0x7da1d65f8b249183667cde74c5cbd46dd38aa829";
    const POSITION_MANAGER = "0xc01ee65a5087409013202db5e1f77e3b74579abf";
    const PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3";

    // Payment token (USDC)
    const PAYMENT_TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia USDC
    const PAYMENT_SEED = hre.ethers.parseUnits("100000", 6); // 100k USDC for LP
    const POOL_SEED_AMOUNT = hre.ethers.parseEther("1000000000"); // 1B tokens for LP (pre-minted on deploy)

    // sqrtPriceX96 configuration
    // 100k USDC : 1B tokens ratio (0.0001 USDC per token)
    // sqrt(0.0001) * 2^96 when USDC is token0, sqrt(10000) * 2^96 when token is token0
    const SQRT_PRICE_PAYMENT_FIRST = "3961408125713216879041820949"; // sqrt(0.0001) * 2^96
    const SQRT_PRICE_TOKEN_FIRST = "792281625142643375935439503360"; // sqrt(10000) * 2^96

    // ==================== Display config ====================

    console.log("📋 Deployment Configuration:");
    console.log("──────────────────────────────────────");
    console.log(`Token: ${TOKEN_NAME} (${TOKEN_SYMBOL})`);
    console.log(`Mint Amount: ${hre.ethers.formatEther(MINT_AMOUNT)} per payment`);
    console.log(`Max Mint Count: ${MAX_MINT_COUNT.toLocaleString()} (users)`);
    console.log(`Max Supply: 2,000,000,000 (2B hardcoded)`);
    console.log();

    console.log("Supply Distribution:");
    console.log(`User Mints: ${hre.ethers.formatEther(MINT_AMOUNT)} × ${MAX_MINT_COUNT.toLocaleString()} = ${hre.ethers.formatEther(MINT_AMOUNT * BigInt(MAX_MINT_COUNT))} ${TOKEN_SYMBOL}`);
    console.log(`LP Pre-mint: ${hre.ethers.formatEther(POOL_SEED_AMOUNT)} ${TOKEN_SYMBOL} (minted on deploy)`);
    console.log(`Total: ${hre.ethers.formatEther(MINT_AMOUNT * BigInt(MAX_MINT_COUNT) + POOL_SEED_AMOUNT)} ${TOKEN_SYMBOL}`);
    console.log();

    console.log("Liquidity Pool:");
    console.log(`Payment Token: ${PAYMENT_TOKEN}`);
    console.log(`Payment Seed: ${hre.ethers.formatUnits(PAYMENT_SEED, 6)} USDC`);
    console.log(`Pool Seed: ${hre.ethers.formatEther(POOL_SEED_AMOUNT)} ${TOKEN_SYMBOL} (already minted)`);
    console.log(`Ratio: ${hre.ethers.formatUnits(PAYMENT_SEED, 6)} USDC : ${hre.ethers.formatEther(POOL_SEED_AMOUNT)} ${TOKEN_SYMBOL}`);
    console.log();

    console.log("Uniswap v4:");
    console.log(`Pool Manager: ${POOL_MANAGER}`);
    console.log(`Position Manager: ${POSITION_MANAGER}`);
    console.log(`Permit2: ${PERMIT2}`);
    console.log("──────────────────────────────────────\n");

    // ==================== Pre-flight checks ====================

    const [deployer] = await hre.ethers.getSigners();
    const balance = await hre.ethers.provider.getBalance(deployer.address);

    console.log("🔍 Pre-deployment:");
    console.log(`Deployer: ${deployer.address}`);
    console.log(`ETH Balance: ${hre.ethers.formatEther(balance)}`);

    // Check USDC balance
    const paymentToken = await hre.ethers.getContractAt(
        ["function balanceOf(address) view returns (uint256)"],
        PAYMENT_TOKEN
    );
    const usdcBalance = await paymentToken.balanceOf(deployer.address);
    console.log(`USDC Balance: ${hre.ethers.formatUnits(usdcBalance, 6)}`);

    if (usdcBalance < PAYMENT_SEED) {
        console.log(`⚠️  WARNING: Need ${hre.ethers.formatUnits(PAYMENT_SEED, 6)} USDC for LP`);
    }
    console.log();

    // ==================== Deploy ====================

    console.log("📦 Deploying...");

    const PAYX = await hre.ethers.getContractFactory("PAYX");
    const token = await PAYX.deploy(
        TOKEN_NAME,
        TOKEN_SYMBOL,
        MINT_AMOUNT,
        MAX_MINT_COUNT,
        POOL_MANAGER,
        POSITION_MANAGER,
        PERMIT2,
        PAYMENT_TOKEN,
        PAYMENT_SEED,
        POOL_SEED_AMOUNT,
        SQRT_PRICE_PAYMENT_FIRST,
        SQRT_PRICE_TOKEN_FIRST
    );

    await token.waitForDeployment();
    const address = await token.getAddress();

    console.log();
    console.log("✅ PAYX deployed!");
    console.log("──────────────────────────────────────");
    console.log(`📍 ${address}`);
    console.log("──────────────────────────────────────");
    console.log();

    // ==================== Verify ====================

    console.log("⏳ Waiting for confirmations...");
    await token.deploymentTransaction().wait(5);
    console.log("✅ Confirmed\n");

    if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
        console.log("📝 Verifying on block explorer...");
        try {
            await hre.run("verify:verify", {
                address: address,
                constructorArguments: [
                    TOKEN_NAME,
                    TOKEN_SYMBOL,
                    MINT_AMOUNT,
                    MAX_MINT_COUNT,
                    POOL_MANAGER,
                    POSITION_MANAGER,
                    PERMIT2,
                    PAYMENT_TOKEN,
                    PAYMENT_SEED,
                    POOL_SEED_AMOUNT,
                    SQRT_PRICE_PAYMENT_FIRST,
                    SQRT_PRICE_TOKEN_FIRST,
                ],
            });
            console.log("✅ Verified\n");
        } catch (error) {
            console.log("⚠️  Verification error:", error.message);
            console.log("   Verify manually later\n");
        }
    }

    // ==================== Next steps ====================

    console.log("🎯 Next Steps:");
    console.log("──────────────────────────────────────");
    console.log("1️⃣  Grant MINTER_ROLE to your server:");
    console.log(`   Edit scripts/grantRole.js with:`);
    console.log(`   TOKEN_CONTRACT_ADDRESS="${address}"`);
    console.log(`   SERVER_ADDRESS="<your-server-address>"`);
    console.log(`   Then run: npx hardhat run scripts/grantRole.js --network baseSepolia`);
    console.log();

    console.log("2️⃣  Transfer USDC to contract:");
    console.log(`   Send ${hre.ethers.formatUnits(PAYMENT_SEED, 6)} USDC to:`);
    console.log(`   ${address}`);
    console.log();

    console.log("3️⃣  (Optional) Set LP Guard Hook:");
    console.log(`   Call: token.setLpGuardHook(<hook-address>)`);
    console.log();

    console.log("4️⃣  Update server/.env:");
    console.log(`   TOKEN_CONTRACT_ADDRESS=${address}`);
    console.log();

    console.log("💡 Notes:");
    console.log(`  • LP pre-minted: ${hre.ethers.formatEther(POOL_SEED_AMOUNT)} ${TOKEN_SYMBOL} (already in contract)`);
    console.log(`  • LP auto-deploys after ${MAX_MINT_COUNT.toLocaleString()} user mints`);
    console.log("  • Max supply: 2B tokens");
    console.log("  • Supports EIP-3009 gasless transfers");
    console.log("  • Make sure contract has USDC before max mints reached");
    console.log("──────────────────────────────────────");
    console.log();
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
