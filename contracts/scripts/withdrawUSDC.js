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
    const token = await hre.ethers.getContractAt("X402Token", TOKEN_ADDRESS);

    // Check admin ETH balance for gas
    const ethBalance = await hre.ethers.provider.getBalance(admin.address);
    console.log(`💵 Admin ETH balance: ${hre.ethers.formatEther(ethBalance)} ETH`);
    if (ethBalance === 0n) {
        console.error(`\n❌ No ETH for gas fees! Admin needs ETH to pay for transaction.`);
        process.exit(1);
    }

    // Verify USDC address
    console.log(`\n💵 Verifying payment token...`);
    const paymentToken = await token.paymentToken();
    const USDC_BASE_MAINNET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    console.log(`   Payment Token: ${paymentToken}`);
    console.log(`   Expected USDC: ${USDC_BASE_MAINNET}`);

    if (hre.network.name === "base" && paymentToken.toLowerCase() !== USDC_BASE_MAINNET.toLowerCase()) {
        console.error(`\n⚠️  WARNING: Payment token doesn't match Base mainnet USDC!`);
        console.error(`   This might not be USDC or wrong network.`);
        console.error(`   Proceeding anyway...`);
    } else if (hre.network.name === "base") {
        console.log(`   ✅ Correct Base mainnet USDC`);
    }

    // Check admin role FIRST
    console.log(`\n🔐 Checking permissions...`);
    const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
    const hasRole = await token.hasRole(DEFAULT_ADMIN_ROLE, admin.address);
    console.log(`   DEFAULT_ADMIN_ROLE: ${hasRole ? "✅ YES" : "❌ NO"}`);

    if (!hasRole) {
        console.error(`\n❌ PERMISSION DENIED!`);
        console.error(`   Address ${admin.address} does not have DEFAULT_ADMIN_ROLE`);
        console.error(`\n   Possible causes:`);
        console.error(`   1. Wrong private key in .env file`);
        console.error(`   2. Need to grant role with: npx hardhat run scripts/grantMinterRole.js`);
        console.error(`   3. Contract was deployed with different admin`);
        process.exit(1);
    }

    // Check current USDC balance - verify via multiple methods
    const currentBalance = await token.getUSDCBalance();
    console.log(`\n📊 Current USDC balance in contract: ${hre.ethers.formatUnits(currentBalance, 6)} USDC`);

    // Double-check by querying USDC contract directly
    const USDC = await hre.ethers.getContractAt(
        "@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20",
        paymentToken
    );
    const directBalance = await USDC.balanceOf(TOKEN_ADDRESS);
    console.log(`   Direct USDC query: ${hre.ethers.formatUnits(directBalance, 6)} USDC`);
    console.log(`   Match: ${currentBalance.toString() === directBalance.toString() ? "✅" : "❌"}`);

    if (currentBalance === 0n) {
        console.log("\n⚠️  No USDC to withdraw");
        return;
    }

    if (currentBalance.toString() !== directBalance.toString()) {
        console.error(`\n❌ Balance mismatch detected!`);
        console.error(`   This indicates a contract logic issue.`);
        process.exit(1);
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

    // Test gas estimation before executing
    console.log(`\n🧪 Testing transaction...`);
    let shouldForceExecute = false;
    let manualGasLimit = null;

    try {
        const gasEstimate = await token.withdrawUSDC.estimateGas(withdrawAmount, recipient);
        console.log(`   ✅ Gas estimate: ${gasEstimate.toString()}`);
        manualGasLimit = gasEstimate;
    } catch (gasError) {
        console.error(`\n⚠️  Gas estimation failed!`);
        console.error(`   Error: ${gasError.shortMessage || gasError.message}`);

        // Deep diagnosis
        console.log(`\n🔬 Deep diagnosis...`);

        // Re-check balance at this exact moment
        const balanceNow = await USDC.balanceOf(TOKEN_ADDRESS);
        console.log(`   USDC balance NOW: ${balanceNow.toString()} (${hre.ethers.formatUnits(balanceNow, 6)} USDC)`);
        console.log(`   Withdraw amount: ${withdrawAmount.toString()}`);
        console.log(`   Balance >= Amount: ${balanceNow >= withdrawAmount}`);

        // Check contract state
        const assetsTransferred = await token.assetsTransferred();
        const mintCount = await token.mintCount();
        const maxMintCount = await token.maxMintCount();
        console.log(`\n   Contract state:`);
        console.log(`   - Assets transferred: ${assetsTransferred}`);
        console.log(`   - Mint count: ${mintCount}/${maxMintCount}`);

        // Try to simulate the withdraw call to see exact revert reason
        console.log(`\n   Attempting static call...`);
        try {
            await token.withdrawUSDC.staticCall(withdrawAmount, recipient);
            console.log(`   ✅ Static call succeeded!`);
            console.log(`\n   🎯 Diagnosis: This is a gas estimation bug, not a transaction failure.`);
            console.log(`   The transaction should work if we bypass gas estimation.`);
            shouldForceExecute = true;
            manualGasLimit = 200000n; // Safe gas limit for ERC20 transfer
        } catch (staticError) {
            console.log(`   ❌ Static call failed: ${staticError.shortMessage || staticError.message}`);

            // Check if error contains specific info
            if (staticError.data) {
                console.log(`   Error data: ${staticError.data}`);
            }

            console.error(`\n   💡 Transaction will likely fail. Not proceeding.`);
            process.exit(1);
        }
    }

    if (shouldForceExecute) {
        console.log(`\n⚠️  Proceeding with manual gas limit: ${manualGasLimit}`);
    }

    console.log(`\n⏳ Executing withdrawal...`);

    // Get current gas prices for EIP-1559
    const feeData = await hre.ethers.provider.getFeeData();
    console.log(`   Base fee: ${hre.ethers.formatUnits(feeData.maxFeePerGas || 0n, "gwei")} gwei`);
    console.log(`   Priority fee: ${hre.ethers.formatUnits(feeData.maxPriorityFeePerGas || 0n, "gwei")} gwei`);

    // Execute withdrawal with EIP-1559 gas settings
    const txOptions = {
        maxFeePerGas: feeData.maxFeePerGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        ...(manualGasLimit ? { gasLimit: manualGasLimit } : {})
    };

    const tx = await token.withdrawUSDC(withdrawAmount, recipient, txOptions);
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
