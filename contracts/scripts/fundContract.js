const hre = require("hardhat");

/**
 * Fund PAYX contract with USDC for liquidity deployment
 * 
 * Usage:
 *   TOKEN_CONTRACT_ADDRESS=0x... USDC_AMOUNT=40000 npx hardhat run scripts/fundContract.js --network baseSepolia
 */

async function main() {
    console.log("💵 PAYX - Fund Contract with USDC\n");

    // ==================== Configuration ====================

    const TOKEN_CONTRACT_ADDRESS = process.env.TOKEN_CONTRACT_ADDRESS || process.argv[2];
    const USDC_ADDRESS = process.env.USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia USDC

    // USDC amount to transfer (in USDC units, e.g. 40000 = 40000 USDC)
    const USDC_AMOUNT = process.env.USDC_AMOUNT || process.argv[3];

    if (!TOKEN_CONTRACT_ADDRESS || !USDC_AMOUNT) {
        console.error("❌ Error: TOKEN_CONTRACT_ADDRESS and USDC_AMOUNT required");
        console.error("\nUsage:");
        console.error("  TOKEN_CONTRACT_ADDRESS=0x... USDC_AMOUNT=40000 \\");
        console.error("    npx hardhat run scripts/fundContract.js --network baseSepolia");
        process.exit(1);
    }

    // ==================== Connect ====================

    const [signer] = await hre.ethers.getSigners();
    const amountToTransfer = hre.ethers.parseUnits(USDC_AMOUNT, 6);

    console.log("📋 Configuration:");
    console.log("──────────────────────────────────────");
    console.log(`Signer: ${signer.address}`);
    console.log(`PAYX Contract: ${TOKEN_CONTRACT_ADDRESS}`);
    console.log(`USDC Address: ${USDC_ADDRESS}`);
    console.log(`Amount: ${hre.ethers.formatUnits(amountToTransfer, 6)} USDC`);
    console.log("──────────────────────────────────────\n");

    // Get contracts
    const PAYX = await hre.ethers.getContractAt("PAYX", TOKEN_CONTRACT_ADDRESS);
    const USDC = await hre.ethers.getContractAt(
        ["function balanceOf(address) view returns (uint256)", "function transfer(address,uint256) returns (bool)"],
        USDC_ADDRESS
    );

    // ==================== Check Balances ====================

    console.log("🔍 Checking balances...");

    const signerUSDCBalance = await USDC.balanceOf(signer.address);
    const contractUSDCBalanceBefore = await USDC.balanceOf(TOKEN_CONTRACT_ADDRESS);
    const paymentSeed = await PAYX.paymentSeed();

    console.log(`Your USDC Balance: ${hre.ethers.formatUnits(signerUSDCBalance, 6)} USDC`);
    console.log(`Contract USDC Balance: ${hre.ethers.formatUnits(contractUSDCBalanceBefore, 6)} USDC`);
    console.log(`Required for LP: ${hre.ethers.formatUnits(paymentSeed, 6)} USDC\n`);

    if (signerUSDCBalance < amountToTransfer) {
        console.error(`❌ Error: Insufficient USDC balance`);
        console.error(`   Required: ${hre.ethers.formatUnits(amountToTransfer, 6)} USDC`);
        console.error(`   Available: ${hre.ethers.formatUnits(signerUSDCBalance, 6)} USDC`);
        process.exit(1);
    }

    // ==================== Check Mint Progress ====================

    console.log("📊 Checking mint progress...");

    const mintCount = await PAYX.mintCount();
    const maxMintCount = await PAYX.maxMintCount();
    const liquidityDeployed = await PAYX.liquidityDeployed();
    const progress = (Number(mintCount) * 100 / Number(maxMintCount)).toFixed(2);

    console.log(`Mint Progress: ${mintCount.toString()} / ${maxMintCount.toString()} (${progress}%)`);
    console.log(`Liquidity Deployed: ${liquidityDeployed ? "Yes" : "No"}\n`);

    if (liquidityDeployed) {
        console.log("⚠️  Warning: Liquidity already deployed");
        console.log("   Contract no longer needs USDC for LP");
        console.log("   Do you want to continue? Press Ctrl+C to cancel, or wait 5 seconds...\n");
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // ==================== Transfer USDC ====================

    console.log("💸 Transferring USDC to contract...");

    try {
        const tx = await USDC.transfer(TOKEN_CONTRACT_ADDRESS, amountToTransfer);
        console.log(`Transaction sent: ${tx.hash}`);
        console.log("⏳ Waiting for confirmation...");

        const receipt = await tx.wait();
        console.log(`✅ Confirmed in block ${receipt.blockNumber}\n`);

        // ==================== Verify ====================

        console.log("🔍 Verifying transfer...");

        const contractUSDCBalanceAfter = await USDC.balanceOf(TOKEN_CONTRACT_ADDRESS);
        const signerUSDCBalanceAfter = await USDC.balanceOf(signer.address);

        console.log("──────────────────────────────────────");
        console.log("Before:");
        console.log(`  Signer: ${hre.ethers.formatUnits(signerUSDCBalance, 6)} USDC`);
        console.log(`  Contract: ${hre.ethers.formatUnits(contractUSDCBalanceBefore, 6)} USDC`);
        console.log("\nAfter:");
        console.log(`  Signer: ${hre.ethers.formatUnits(signerUSDCBalanceAfter, 6)} USDC`);
        console.log(`  Contract: ${hre.ethers.formatUnits(contractUSDCBalanceAfter, 6)} USDC`);
        console.log("\nChange:");
        console.log(`  Transferred: ${hre.ethers.formatUnits(amountToTransfer, 6)} USDC`);
        console.log("──────────────────────────────────────\n");

        // Check if contract has enough for LP
        if (contractUSDCBalanceAfter >= paymentSeed) {
            console.log("✅ Contract now has sufficient USDC for liquidity deployment!");
        } else {
            const remaining = paymentSeed - contractUSDCBalanceAfter;
            console.log(`⚠️  Contract still needs ${hre.ethers.formatUnits(remaining, 6)} USDC for LP`);
        }

        console.log("\n✅ Transfer successful!");

    } catch (error) {
        console.error("❌ Transfer failed:", error.message);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

