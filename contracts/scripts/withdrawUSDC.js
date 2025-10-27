const hre = require("hardhat");

/**
 * Withdraw USDC from token contract (convenience script)
 * 
 * For withdrawing other ERC20 tokens, use withdrawERC20.js
 * 
 * Usage:
 * TOKEN=0x... AMOUNT=1000000 RECIPIENT=0x... npx hardhat run scripts/withdrawUSDC.js --network baseSepolia
 * 
 * Environment variables:
 * - TOKEN: Token contract address (required)
 * - AMOUNT: Amount in USDC (6 decimals). Use 0 or omit to withdraw all (optional)
 * - RECIPIENT: Address to receive USDC. Use 0x0 or omit for msg.sender (optional)
 */
async function main() {
    const TOKEN_ADDRESS = process.env.TOKEN;
    const AMOUNT = process.env.AMOUNT || "0"; // 0 = withdraw all
    const RECIPIENT = process.env.RECIPIENT || "0x0000000000000000000000000000000000000000"; // 0x0 = msg.sender

    if (!TOKEN_ADDRESS) {
        console.error("❌ TOKEN environment variable required");
        console.error("\nUsage:");
        console.error("  TOKEN=0x... npx hardhat run scripts/withdrawUSDC.js --network baseSepolia");
        console.error("\nOptional:");
        console.error("  AMOUNT=1000000  # Amount in USDC (6 decimals), 0 = all");
        console.error("  RECIPIENT=0x... # Recipient address, 0x0 = sender");
        process.exit(1);
    }

    const [admin] = await hre.ethers.getSigners();

    console.log(`\n💰 Withdrawing USDC from Token Contract`);
    console.log(`   Token: ${TOKEN_ADDRESS}`);
    console.log(`   Admin: ${admin.address}`);
    console.log(`   Network: ${hre.network.name}\n`);

    // Get token contract
    const token = await hre.ethers.getContractAt("PAYX", TOKEN_ADDRESS);

    // Check current USDC balance
    const currentBalance = await token.getUSDCBalance();
    console.log(`📊 Current USDC balance in contract: ${hre.ethers.formatUnits(currentBalance, 6)} USDC`);

    if (currentBalance === 0n) {
        console.log("\n⚠️  No USDC to withdraw");
        return;
    }

    // Determine withdrawal amount
    const amount = AMOUNT === "0" ? 0n : BigInt(AMOUNT);
    const withdrawAmount = amount === 0n ? currentBalance : amount;

    if (withdrawAmount > currentBalance) {
        console.error(`\n❌ Insufficient balance. Requested: ${hre.ethers.formatUnits(withdrawAmount, 6)} USDC, Available: ${hre.ethers.formatUnits(currentBalance, 6)} USDC`);
        process.exit(1);
    }

    // Determine recipient
    const recipient = RECIPIENT === "0x0000000000000000000000000000000000000000" ? admin.address : RECIPIENT;

    console.log(`\n📤 Withdrawal details:`);
    console.log(`   Amount: ${amount === 0n ? "ALL" : hre.ethers.formatUnits(withdrawAmount, 6)} USDC (${withdrawAmount.toString()} wei)`);
    console.log(`   Recipient: ${recipient}`);
    console.log(`   ${recipient === admin.address ? "(msg.sender)" : "(custom)"}`);

    // Check if admin has the role
    const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
    const hasRole = await token.hasRole(DEFAULT_ADMIN_ROLE, admin.address);

    if (!hasRole) {
        console.error(`\n❌ ${admin.address} does not have DEFAULT_ADMIN_ROLE`);
        process.exit(1);
    }

    console.log(`\n⏳ Executing withdrawal...`);

    // Execute withdrawal
    const tx = await token.withdrawUSDC(withdrawAmount, recipient);
    console.log(`   TX: ${tx.hash}`);

    const receipt = await tx.wait();

    if (receipt.status === 1) {
        console.log(`\n✅ Withdrawal successful!`);
        console.log(`   Block: ${receipt.blockNumber}`);
        console.log(`   Gas used: ${receipt.gasUsed.toString()}`);

        // Check new balance
        const newBalance = await token.getUSDCBalance();
        console.log(`\n📊 New USDC balance in contract: ${hre.ethers.formatUnits(newBalance, 6)} USDC`);
        console.log(`   Withdrawn: ${hre.ethers.formatUnits(withdrawAmount, 6)} USDC`);
    } else {
        console.error(`\n❌ Withdrawal failed`);
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
