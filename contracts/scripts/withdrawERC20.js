const hre = require("hardhat");

/**
 * Withdraw any ERC20 token from token contract
 * 
 * Usage:
 * TOKEN=0x... ERC20=0x... AMOUNT=1000000 RECIPIENT=0x... npx hardhat run scripts/withdrawERC20.js --network baseSepolia
 * 
 * Environment variables:
 * - TOKEN: Token contract address (required)
 * - ERC20: ERC20 token to withdraw (optional, defaults to USDC)
 * - AMOUNT: Amount to withdraw. Use 0 or omit to withdraw all (optional)
 * - RECIPIENT: Address to receive tokens. Use 0x0 or omit for msg.sender (optional)
 * - DECIMALS: Token decimals for display (optional, default 18)
 */
async function main() {
    const TOKEN_ADDRESS = process.env.TOKEN;
    const ERC20_ADDRESS = process.env.ERC20;
    const AMOUNT = process.env.AMOUNT || "0"; // 0 = withdraw all
    const RECIPIENT = process.env.RECIPIENT || "0x0000000000000000000000000000000000000000"; // 0x0 = msg.sender
    const DECIMALS = parseInt(process.env.DECIMALS || "18");

    if (!TOKEN_ADDRESS) {
        console.error("❌ TOKEN environment variable required");
        console.error("\nUsage:");
        console.error("  TOKEN=0x... ERC20=0x... npx hardhat run scripts/withdrawERC20.js --network baseSepolia");
        console.error("\nExamples:");
        console.error("  # Withdraw all USDC (use contract's default)");
        console.error("  TOKEN=0x... npx hardhat run scripts/withdrawERC20.js --network baseSepolia");
        console.error("\n  # Withdraw specific amount of USDC");
        console.error("  TOKEN=0x... AMOUNT=1000000 DECIMALS=6 npx hardhat run scripts/withdrawERC20.js --network baseSepolia");
        console.error("\n  # Withdraw custom ERC20 token");
        console.error("  TOKEN=0x... ERC20=0xCustomToken... npx hardhat run scripts/withdrawERC20.js --network baseSepolia");
        process.exit(1);
    }

    const [admin] = await hre.ethers.getSigners();

    console.log(`\n💰 Withdrawing ERC20 from Token Contract`);
    console.log(`   Token Contract: ${TOKEN_ADDRESS}`);
    console.log(`   Admin: ${admin.address}`);
    console.log(`   Network: ${hre.network.name}\n`);

    // Get token contract
    const token = await hre.ethers.getContractAt("X402Token", TOKEN_ADDRESS);

    // Determine which ERC20 to withdraw
    let erc20Address;
    let tokenName = "ERC20";

    if (!ERC20_ADDRESS) {
        // Default to PAYMENT_TOKEN (USDC)
        erc20Address = await token.PAYMENT_TOKEN();
        tokenName = "USDC";
        console.log(`📍 Using default PAYMENT_TOKEN: ${erc20Address}`);
    } else {
        erc20Address = ERC20_ADDRESS;
        console.log(`📍 Using custom ERC20: ${erc20Address}`);

        // Try to get token symbol
        try {
            const erc20 = await hre.ethers.getContractAt("IERC20", erc20Address);
            // Try to get symbol if available
            if (erc20.symbol) {
                tokenName = await erc20.symbol();
            }
        } catch (e) {
            // Ignore if can't get symbol
        }
    }

    // Check current balance
    const currentBalance = await token.getTokenBalance(ERC20_ADDRESS || "0x0000000000000000000000000000000000000000");
    console.log(`\n📊 Current ${tokenName} balance in contract: ${hre.ethers.formatUnits(currentBalance, DECIMALS)}`);

    if (currentBalance === 0n) {
        console.log(`\n⚠️  No ${tokenName} to withdraw`);
        return;
    }

    // Determine withdrawal amount
    const amount = AMOUNT === "0" ? 0n : BigInt(AMOUNT);
    const withdrawAmount = amount === 0n ? currentBalance : amount;

    if (withdrawAmount > currentBalance) {
        console.error(`\n❌ Insufficient balance. Requested: ${hre.ethers.formatUnits(withdrawAmount, DECIMALS)}, Available: ${hre.ethers.formatUnits(currentBalance, DECIMALS)}`);
        process.exit(1);
    }

    // Determine recipient
    const recipient = RECIPIENT === "0x0000000000000000000000000000000000000000" ? admin.address : RECIPIENT;

    console.log(`\n📤 Withdrawal details:`);
    console.log(`   Token: ${tokenName} (${erc20Address})`);
    console.log(`   Amount: ${amount === 0n ? "ALL" : hre.ethers.formatUnits(withdrawAmount, DECIMALS)} (${withdrawAmount.toString()} wei)`);
    console.log(`   Recipient: ${recipient} ${recipient === admin.address ? "(msg.sender)" : "(custom)"}`);

    // Check if admin has the role
    const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
    const hasRole = await token.hasRole(DEFAULT_ADMIN_ROLE, admin.address);

    if (!hasRole) {
        console.error(`\n❌ ${admin.address} does not have DEFAULT_ADMIN_ROLE`);
        process.exit(1);
    }

    console.log(`\n⏳ Executing withdrawal...`);

    // Execute withdrawal
    let tx;
    if (!ERC20_ADDRESS) {
        // Use convenience function for USDC
        tx = await token.withdrawUSDC(withdrawAmount, recipient);
    } else {
        // Use generic function for any ERC20
        tx = await token.withdrawERC20(erc20Address, withdrawAmount, recipient);
    }

    console.log(`   TX: ${tx.hash}`);

    const receipt = await tx.wait();

    if (receipt.status === 1) {
        console.log(`\n✅ Withdrawal successful!`);
        console.log(`   Block: ${receipt.blockNumber}`);
        console.log(`   Gas used: ${receipt.gasUsed.toString()}`);

        // Check new balance
        const newBalance = await token.getTokenBalance(ERC20_ADDRESS || "0x0000000000000000000000000000000000000000");
        console.log(`\n📊 New ${tokenName} balance in contract: ${hre.ethers.formatUnits(newBalance, DECIMALS)}`);
        console.log(`   Withdrawn: ${hre.ethers.formatUnits(withdrawAmount, DECIMALS)}`);

        // Show explorer link
        const network = hre.network.name;
        const explorerUrl = network === "baseSepolia"
            ? `https://sepolia.basescan.org/tx/${tx.hash}`
            : network === "base"
                ? `https://basescan.org/tx/${tx.hash}`
                : null;

        if (explorerUrl) {
            console.log(`\n🔗 View on explorer: ${explorerUrl}`);
        }
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

