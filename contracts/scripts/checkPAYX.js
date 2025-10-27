const hre = require("hardhat");

/**
 * Check PAYX contract status
 * Displays comprehensive information about the deployed contract
 */

async function main() {
    const tokenAddress = process.env.TOKEN_CONTRACT_ADDRESS || process.argv[2];

    if (!tokenAddress) {
        console.error("Usage: TOKEN_CONTRACT_ADDRESS=0x... npx hardhat run scripts/checkPAYX.js --network baseSepolia");
        console.error("Or: npx hardhat run scripts/checkPAYX.js --network baseSepolia 0xTokenAddress");
        process.exit(1);
    }

    console.log("🔍 Checking PAYX Contract Status");
    console.log("==================================\n");

    try {
        const token = await hre.ethers.getContractAt("PAYX", tokenAddress);
        const [deployer] = await hre.ethers.getSigners();

        // ==================== Basic Information ====================

        const name = await token.name();
        const symbol = await token.symbol();
        const decimals = await token.decimals();
        const totalSupply = await token.totalSupply();
        const maxSupply = await token.MAX_SUPPLY();
        const remainingSupply = await token.remainingSupply();

        console.log("📊 Token Information:");
        console.log("──────────────────────────────────────");
        console.log(`   Name: ${name}`);
        console.log(`   Symbol: ${symbol}`);
        console.log(`   Decimals: ${decimals}`);
        console.log(`   Contract: ${tokenAddress}`);
        console.log();

        console.log("📈 Supply:");
        console.log(`   Total Supply: ${Number(hre.ethers.formatEther(totalSupply)).toLocaleString()} ${symbol}`);
        console.log(`   Max Supply: ${Number(hre.ethers.formatEther(maxSupply)).toLocaleString()} ${symbol}`);
        console.log(`   Remaining: ${Number(hre.ethers.formatEther(remainingSupply)).toLocaleString()} ${symbol}`);

        const supplyPercentage = (Number(totalSupply) * 100 / Number(maxSupply)).toFixed(2);
        console.log(`   Used: ${supplyPercentage}%`);
        console.log();

        // ==================== Mint Configuration ====================

        const mintAmount = await token.MINT_AMOUNT();
        const maxMintCount = await token.MAX_MINT_COUNT();
        const mintCount = await token.mintCount();
        const mintAmountFormatted = Number(hre.ethers.formatEther(mintAmount)).toLocaleString();

        console.log("⚙️  Mint Configuration:");
        console.log("──────────────────────────────────────");
        console.log(`   Mint Amount: ${mintAmountFormatted} ${symbol}`);
        console.log(`   Max Mint Count: ${Number(maxMintCount).toLocaleString()}`);
        console.log(`   Current Mints: ${Number(mintCount).toLocaleString()}`);
        console.log(`   Remaining Mints: ${Number(maxMintCount - mintCount).toLocaleString()}`);

        const mintProgress = (Number(mintCount) * 100 / Number(maxMintCount)).toFixed(2);
        console.log(`   Progress: ${mintProgress}%`);
        console.log();

        // ==================== Liquidity Pool Info ====================

        const liquidityDeployed = await token.liquidityDeployed();
        const paymentSeed = await token.paymentSeed();

        console.log("💧 Liquidity Pool:");
        console.log("──────────────────────────────────────");
        console.log(`   LP Deployed: ${liquidityDeployed ? "✅ YES" : "❌ NO"}`);
        console.log(`   Payment Seed: ${Number(hre.ethers.formatUnits(paymentSeed, 6)).toLocaleString()} USDC`);

        if (!liquidityDeployed) {
            const mintsUntilLP = maxMintCount - mintCount;
            console.log(`   Mints Until LP: ${Number(mintsUntilLP).toLocaleString()}`);
        }

        // Check contract USDC balance
        const PAYMENT_TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia USDC
        const usdcContract = await hre.ethers.getContractAt(
            ["function balanceOf(address) view returns (uint256)"],
            PAYMENT_TOKEN
        );
        const usdcBalance = await usdcContract.balanceOf(tokenAddress);
        console.log(`   Contract USDC: ${Number(hre.ethers.formatUnits(usdcBalance, 6)).toLocaleString()} USDC`);

        if (!liquidityDeployed && usdcBalance < paymentSeed) {
            console.log(`   ⚠️  WARNING: Need ${Number(hre.ethers.formatUnits(paymentSeed - usdcBalance, 6)).toLocaleString()} more USDC`);
        }
        console.log();

        // ==================== Roles ====================

        const MINTER_ROLE = await token.MINTER_ROLE();
        const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
        const owner = await token.owner();

        console.log("🔑 Access Control:");
        console.log("──────────────────────────────────────");
        console.log(`   Owner: ${owner}`);
        console.log(`   DEFAULT_ADMIN_ROLE: ${DEFAULT_ADMIN_ROLE}`);
        console.log(`   MINTER_ROLE: ${MINTER_ROLE}`);
        console.log();

        // Check current signer's roles
        const signerAddress = deployer.address;
        const hasMinterRole = await token.hasRole(MINTER_ROLE, signerAddress);
        const hasAdminRole = await token.hasRole(DEFAULT_ADMIN_ROLE, signerAddress);

        console.log(`👤 Current Signer (${signerAddress}):`);
        console.log(`   MINTER_ROLE: ${hasMinterRole ? "✅ YES" : "❌ NO"}`);
        console.log(`   ADMIN_ROLE: ${hasAdminRole ? "✅ YES" : "❌ NO"}`);
        console.log();

        // Check server address if provided
        const serverAddress = process.env.SERVER_ADDRESS;
        if (serverAddress) {
            const serverHasMinter = await token.hasRole(MINTER_ROLE, serverAddress);
            const serverHasAdmin = await token.hasRole(DEFAULT_ADMIN_ROLE, serverAddress);

            console.log(`🖥️  Server (${serverAddress}):`);
            console.log(`   MINTER_ROLE: ${serverHasMinter ? "✅ YES" : "❌ NO"}`);
            console.log(`   ADMIN_ROLE: ${serverHasAdmin ? "✅ YES" : "❌ NO"}`);

            if (!serverHasMinter) {
                console.log("\n⚠️  WARNING: Server doesn't have MINTER_ROLE!");
                console.log("   Run: TOKEN_CONTRACT_ADDRESS=" + tokenAddress + " SERVER_ADDRESS=" + serverAddress + " npx hardhat run scripts/grantRole.js --network " + hre.network.name);
            }
            console.log();
        }

        // ==================== Token Balances ====================

        const contractBalance = await token.balanceOf(tokenAddress);
        console.log("💰 Token Balances:");
        console.log("──────────────────────────────────────");
        console.log(`   Contract: ${Number(hre.ethers.formatEther(contractBalance)).toLocaleString()} ${symbol}`);

        if (signerAddress) {
            const signerBalance = await token.balanceOf(signerAddress);
            console.log(`   Your Balance: ${Number(hre.ethers.formatEther(signerBalance)).toLocaleString()} ${symbol}`);
        }
        console.log();

        // ==================== EIP-3009 Support ====================

        try {
            const domainSeparator = await token.DOMAIN_SEPARATOR();
            console.log("✨ EIP-3009 Support:");
            console.log("──────────────────────────────────────");
            console.log(`   Enabled: ✅ YES`);
            console.log(`   Domain: ${domainSeparator.slice(0, 10)}...`);
            console.log();
        } catch {
            console.log("EIP-3009 not supported\n");
        }

        // ==================== Health Check ====================

        console.log("🏥 Health Check:");
        console.log("──────────────────────────────────────");

        const issues = [];

        // Check 1: Supply consistency
        if (totalSupply > maxSupply) {
            issues.push("❌ Total supply exceeds max supply!");
        } else {
            console.log("✅ Supply within limits");
        }

        // Check 2: LP readiness
        if (!liquidityDeployed && mintCount < maxMintCount) {
            if (usdcBalance >= paymentSeed) {
                console.log("✅ USDC ready for LP deployment");
            } else {
                issues.push(`⚠️  Need ${Number(hre.ethers.formatUnits(paymentSeed - usdcBalance, 6)).toLocaleString()} more USDC for LP`);
            }
        }

        // Check 3: Roles configured
        if (!hasMinterRole && !serverAddress) {
            issues.push("⚠️  No minter role assigned (you or specify SERVER_ADDRESS)");
        }

        if (liquidityDeployed) {
            console.log("✅ LP deployed and operational");
        } else {
            console.log(`⏳ LP will deploy after ${Number(maxMintCount - mintCount).toLocaleString()} more mints`);
        }

        console.log();

        if (issues.length === 0) {
            console.log("✅ All systems operational!");
        } else {
            console.log("⚠️  Issues found:");
            issues.forEach(issue => console.log("   " + issue));
        }

        console.log();
        console.log("==================================");
        console.log("✅ Status check complete");

    } catch (error) {
        console.error("\n❌ Error checking contract:");
        console.error(error.message);
        console.error("\nMake sure:");
        console.error("1. Contract address is correct");
        console.error("2. Network is correct (--network baseSepolia)");
        console.error("3. Contract is a PAYX contract");
        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
