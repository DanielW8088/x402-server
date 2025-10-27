const hre = require("hardhat");

/**
 * Withdraw USDC (or any ERC20) from PAYX contract
 * Usage:
 *   npx hardhat run scripts/withdrawUSDC.js --network baseSepolia
 * 
 * Or with env vars:
 *   TOKEN_CONTRACT_ADDRESS=0x... USDC_AMOUNT=1000 npx hardhat run scripts/withdrawUSDC.js --network baseSepolia
 */

async function main() {
    console.log("💰 PAYX - Withdraw USDC\n");

    // ==================== Configuration ====================

    const TOKEN_CONTRACT_ADDRESS = process.env.TOKEN_CONTRACT_ADDRESS || process.argv[2];
    const USDC_ADDRESS = process.env.USDC_ADDRESS || "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia USDC

    // USDC amount to withdraw (in USDC units, e.g. 1000 = 1000 USDC)
    const USDC_AMOUNT = process.env.USDC_AMOUNT || process.argv[3];

    // Recipient address (defaults to deployer)
    const RECIPIENT = process.env.RECIPIENT_ADDRESS || process.argv[4];

    if (!TOKEN_CONTRACT_ADDRESS) {
        console.error("❌ Error: TOKEN_CONTRACT_ADDRESS required");
        console.error("\nUsage:");
        console.error("  npx hardhat run scripts/withdrawUSDC.js --network baseSepolia \\");
        console.error("    <TOKEN_CONTRACT_ADDRESS> [USDC_AMOUNT] [RECIPIENT_ADDRESS]");
        console.error("\nOr with env vars:");
        console.error("  TOKEN_CONTRACT_ADDRESS=0x... USDC_AMOUNT=1000 npx hardhat run scripts/withdrawUSDC.js --network baseSepolia");
        process.exit(1);
    }

    // ==================== Connect ====================

    const [signer] = await hre.ethers.getSigners();
    console.log("📋 Configuration:");
    console.log("──────────────────────────────────────");
    console.log(`Signer: ${signer.address}`);
    console.log(`PAYX Contract: ${TOKEN_CONTRACT_ADDRESS}`);
    console.log(`USDC Address: ${USDC_ADDRESS}`);
    console.log("──────────────────────────────────────\n");

    // Get contracts
    const PAYX = await hre.ethers.getContractAt("PAYX", TOKEN_CONTRACT_ADDRESS);
    const USDC = await hre.ethers.getContractAt(
        ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"],
        USDC_ADDRESS
    );

    // ==================== Check Balance ====================

    console.log("🔍 Checking balances...");

    const contractUSDCBalance = await USDC.balanceOf(TOKEN_CONTRACT_ADDRESS);
    const signerUSDCBalanceBefore = await USDC.balanceOf(signer.address);

    console.log(`Contract USDC Balance: ${hre.ethers.formatUnits(contractUSDCBalance, 6)} USDC`);
    console.log(`Signer USDC Balance: ${hre.ethers.formatUnits(signerUSDCBalanceBefore, 6)} USDC\n`);

    if (contractUSDCBalance === 0n) {
        console.log("⚠️  Contract has no USDC to withdraw");
        process.exit(0);
    }

    // ==================== Determine Amount ====================

    let amountToWithdraw;
    let recipientAddress = RECIPIENT || signer.address;

    if (!USDC_AMOUNT || USDC_AMOUNT === "all" || USDC_AMOUNT === "max") {
        // Withdraw all
        amountToWithdraw = contractUSDCBalance;
        console.log("📤 Withdrawing ALL USDC from contract");
    } else {
        // Withdraw specific amount
        amountToWithdraw = hre.ethers.parseUnits(USDC_AMOUNT, 6);
        console.log(`📤 Withdrawing ${hre.ethers.formatUnits(amountToWithdraw, 6)} USDC`);

        if (amountToWithdraw > contractUSDCBalance) {
            console.error(`❌ Error: Amount exceeds contract balance`);
            console.error(`   Requested: ${hre.ethers.formatUnits(amountToWithdraw, 6)} USDC`);
            console.error(`   Available: ${hre.ethers.formatUnits(contractUSDCBalance, 6)} USDC`);
            process.exit(1);
        }
    }

    console.log(`To: ${recipientAddress}\n`);

    // ==================== Check Admin Role ====================

    console.log("🔐 Checking permissions...");

    const DEFAULT_ADMIN_ROLE = await PAYX.DEFAULT_ADMIN_ROLE();
    const hasAdminRole = await PAYX.hasRole(DEFAULT_ADMIN_ROLE, signer.address);

    if (!hasAdminRole) {
        console.error(`❌ Error: ${signer.address} does not have DEFAULT_ADMIN_ROLE`);
        console.error("   Only admin can withdraw tokens");
        process.exit(1);
    }

    console.log("✅ Admin role confirmed\n");

    // ==================== Withdraw ====================

    console.log("💸 Executing withdrawal...");

    try {
        const tx = await PAYX.withdrawToken(USDC_ADDRESS, amountToWithdraw);
        console.log(`Transaction sent: ${tx.hash}`);
        console.log("⏳ Waiting for confirmation...");

        const receipt = await tx.wait();
        console.log(`✅ Confirmed in block ${receipt.blockNumber}\n`);

        // ==================== Verify ====================

        console.log("🔍 Verifying withdrawal...");

        const contractUSDCBalanceAfter = await USDC.balanceOf(TOKEN_CONTRACT_ADDRESS);
        const signerUSDCBalanceAfter = await USDC.balanceOf(recipientAddress);

        console.log("──────────────────────────────────────");
        console.log("Before:");
        console.log(`  Contract: ${hre.ethers.formatUnits(contractUSDCBalance, 6)} USDC`);
        console.log(`  Recipient: ${hre.ethers.formatUnits(signerUSDCBalanceBefore, 6)} USDC`);
        console.log("\nAfter:");
        console.log(`  Contract: ${hre.ethers.formatUnits(contractUSDCBalanceAfter, 6)} USDC`);
        console.log(`  Recipient: ${hre.ethers.formatUnits(signerUSDCBalanceAfter, 6)} USDC`);
        console.log("\nChange:");
        console.log(`  Withdrawn: ${hre.ethers.formatUnits(amountToWithdraw, 6)} USDC`);
        console.log("──────────────────────────────────────\n");

        console.log("✅ Withdrawal successful!");

    } catch (error) {
        console.error("❌ Withdrawal failed:", error.message);

        if (error.message.includes("Liquidity already deployed")) {
            console.error("\n⚠️  Note: Cannot use emergencyWithdraw after liquidity deployment");
            console.error("   Use withdrawToken function instead (which this script does)");
        }

        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

