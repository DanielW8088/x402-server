const hre = require("hardhat");

/**
 * Simplified PAYX deployment + single mint for testing
 * Deploys contract and mints tokens in one go
 */

async function main() {
    console.log("🚀 Deploying PAYX + Mint Test...\n");

    // ==================== Configuration ====================

    // Token config
    const TOKEN_NAME = "PAYX";
    const TOKEN_SYMBOL = "PAYX";
    const MINT_AMOUNT = hre.ethers.parseEther("10000"); // 10k tokens per mint
    const MAX_MINT_COUNT = 160000; // 160k mints max (80% of 2B supply)

    // Uniswap v4 addresses (Base Sepolia)
    const POOL_MANAGER = "0x7da1d65f8b249183667cde74c5cbd46dd38aa829";
    const POSITION_MANAGER = "0xc01ee65a5087409013202db5e1f77e3b74579abf";
    const PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3";

    // Payment token (USDC)
    const PAYMENT_TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia USDC
    const PAYMENT_SEED = hre.ethers.parseUnits("40000", 6); // 40k USDC for LP (20% allocation)
    const POOL_SEED_AMOUNT = hre.ethers.parseEther("400000000"); // 400M tokens for LP (20% allocation)

    // sqrtPriceX96 configuration (40k USDC : 400M PAYX = 0.0001 USDC per token)
    const SQRT_PRICE_PAYMENT_FIRST = "7922816251426434139029504"; // USDC is token0
    const SQRT_PRICE_TOKEN_FIRST = "792281625142643375935439503360000"; // PAYX is token0

    // Mint test config
    const TEST_MINT_ADDRESS = process.env.TEST_MINT_ADDRESS; // Optional: specify recipient
    const TEST_TX_HASH = hre.ethers.keccak256(hre.ethers.toUtf8Bytes(`test-mint-${Date.now()}`));

    // ==================== Display config ====================

    const [deployer] = await hre.ethers.getSigners();
    const recipientAddress = TEST_MINT_ADDRESS || deployer.address;

    console.log("📋 Configuration:");
    console.log("──────────────────────────────────────");
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Test Mint To: ${recipientAddress}`);
    console.log(`Mint Amount: ${hre.ethers.formatEther(MINT_AMOUNT)} ${TOKEN_SYMBOL}`);
    console.log("──────────────────────────────────────\n");

    // ==================== Deploy ====================

    console.log("📦 Deploying PAYX...");

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

    console.log(`✅ PAYX deployed: ${address}`);

    // Wait for deployment to finalize
    console.log("⏳ Waiting for deployment confirmation...");
    await token.deploymentTransaction().wait(2);
    console.log();

    // ==================== Mint Test Token ====================

    console.log("🪙 Minting test tokens...");

    // Get fresh nonce and gas price
    const nonce = await deployer.getNonce();
    const feeData = await hre.ethers.provider.getFeeData();

    const mintTx = await token.mint(recipientAddress, TEST_TX_HASH, {
        nonce: nonce,
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
    });
    await mintTx.wait();

    console.log(`✅ Minted ${hre.ethers.formatEther(MINT_AMOUNT)} ${TOKEN_SYMBOL} to ${recipientAddress}`);
    console.log(`   TX Hash: ${mintTx.hash}\n`);

    // ==================== Verify State ====================

    const balance = await token.balanceOf(recipientAddress);
    const mintCount = await token.mintCount();
    const totalSupply = await token.totalSupply();

    console.log("📊 Contract State:");
    console.log("──────────────────────────────────────");
    console.log(`Total Supply: ${hre.ethers.formatEther(totalSupply)} ${TOKEN_SYMBOL}`);
    console.log(`Mint Count: ${mintCount} / ${MAX_MINT_COUNT}`);
    console.log(`User Balance: ${hre.ethers.formatEther(balance)} ${TOKEN_SYMBOL}`);
    console.log(`LP Pre-minted: ${hre.ethers.formatEther(POOL_SEED_AMOUNT)} ${TOKEN_SYMBOL}`);
    console.log("──────────────────────────────────────\n");

    // ==================== Summary ====================

    console.log("🎯 Deployment Summary:");
    console.log("──────────────────────────────────────");
    console.log(`Contract Address: ${address}`);
    console.log(`Test Mint: SUCCESS`);
    console.log(`Ready for testing ✓`);
    console.log("──────────────────────────────────────\n");

    console.log("💡 Next Steps:");
    console.log("1. Grant MINTER_ROLE to server (if needed):");
    console.log(`   TOKEN_CONTRACT_ADDRESS=${address} SERVER_ADDRESS=<address> npx hardhat run scripts/grantRole.js --network baseSepolia`);
    console.log("2. Update server/.env:");
    console.log(`   TOKEN_CONTRACT_ADDRESS=${address}`);
    console.log("3. Transfer USDC to contract before max mints:");
    console.log(`   ${hre.ethers.formatUnits(PAYMENT_SEED, 6)} USDC to ${address}`);
    console.log();
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

