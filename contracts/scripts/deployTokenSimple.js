const hre = require("hardhat");

/**
 * Deploy X402Token token (Simplified LP deployment)
 * 
 * Environment variables:
 * - TOKEN_NAME: Token name
 * - TOKEN_SYMBOL: Token symbol  
 * - MINT_AMOUNT: Tokens per mint (e.g., "1000")
 * - MAX_MINT_COUNT: Max number of mints (e.g., 10)
 * - PRICE: Price in USDC (e.g., "1")
 * - EXCESS_RECIPIENT: Address to receive excess USDC
 * - LP_DEPLOYER: Address that will deploy LP (receives tokens and USDC)
 */
async function main() {
    const TOKEN_NAME = process.env.TOKEN_NAME || "Test Token";
    const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL || "TTK";
    const MINT_AMOUNT = process.env.MINT_AMOUNT || "1000";
    const MAX_MINT_COUNT = parseInt(process.env.MAX_MINT_COUNT || "10");
    const PRICE = process.env.PRICE || "1";
    const EXCESS_RECIPIENT = process.env.EXCESS_RECIPIENT;
    const LP_DEPLOYER = process.env.LP_DEPLOYER;

    const [deployer] = await hre.ethers.getSigners();

    if (!EXCESS_RECIPIENT) {
        console.error("❌ EXCESS_RECIPIENT environment variable required");
        process.exit(1);
    }

    if (!LP_DEPLOYER) {
        console.error("❌ LP_DEPLOYER environment variable required");
        console.error("   This is the address that will receive tokens and USDC for LP deployment");
        process.exit(1);
    }

    console.log(`\n🚀 Deploying X402Token Token (Simplified LP Deployment)`);
    console.log(`   Deployer: ${deployer.address}`);
    console.log(`   Name: ${TOKEN_NAME}`);
    console.log(`   Symbol: ${TOKEN_SYMBOL}`);
    console.log(`   Mint Amount: ${MINT_AMOUNT} tokens`);
    console.log(`   Max Mints: ${MAX_MINT_COUNT}`);
    console.log(`   Price: ${PRICE} USDC`);
    console.log(`   Excess Recipient: ${EXCESS_RECIPIENT}`);
    console.log(`   LP Deployer: ${LP_DEPLOYER}\n`);

    // Network configuration
    const network = hre.network.name;
    let USDC;

    if (network === "baseSepolia") {
        USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
    } else if (network === "base") {
        USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    } else {
        console.error(`❌ Unsupported network: ${network}`);
        process.exit(1);
    }

    console.log(`📍 Network: ${network}`);
    console.log(`   USDC: ${USDC}\n`);

    // Calculate amounts (Token now uses 6 decimals like USDC)
    const TOKEN_DECIMALS = 6;
    const mintAmountWei = hre.ethers.parseUnits(MINT_AMOUNT, TOKEN_DECIMALS);
    const totalUserMint = mintAmountWei * BigInt(MAX_MINT_COUNT);
    const poolSeedAmount = totalUserMint / 4n; // 20% for LP
    const pricePerMintUSDC = hre.ethers.parseUnits(PRICE, 6);

    console.log(`💰 Token Economics:`);
    console.log(`   Total User Mintable: ${hre.ethers.formatUnits(totalUserMint, TOKEN_DECIMALS)} tokens (80%)`);
    console.log(`   LP Pool Reserve: ${hre.ethers.formatUnits(poolSeedAmount, TOKEN_DECIMALS)} tokens (20%)`);
    console.log(`   USDC Required for LP: ${hre.ethers.formatUnits(poolSeedAmount * pricePerMintUSDC / mintAmountWei, 6)} USDC`);
    console.log(`   Total USDC Revenue: ${hre.ethers.formatUnits(pricePerMintUSDC * BigInt(MAX_MINT_COUNT), 6)} USDC\n`);

    // Deploy contract
    console.log(`🔨 Deploying contract...`);
    const X402Token = await hre.ethers.getContractFactory("X402Token");
    const token = await X402Token.deploy(
        TOKEN_NAME,
        TOKEN_SYMBOL,
        mintAmountWei,
        MAX_MINT_COUNT,
        USDC,
        pricePerMintUSDC,
        poolSeedAmount,
        EXCESS_RECIPIENT,
        LP_DEPLOYER
    );

    await token.waitForDeployment();
    const address = await token.getAddress();

    console.log(`✅ Token deployed to: ${address}`);

    // Wait for confirmations
    const receipt = await token.deploymentTransaction().wait(3);

    console.log(`   Block: ${receipt.blockNumber}`);
    console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
    console.log(`   TX: ${receipt.hash}\n`);

    // Output JSON for parsing
    console.log("DEPLOY_RESULT:", JSON.stringify({
        address: address,
        name: TOKEN_NAME,
        symbol: TOKEN_SYMBOL,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        network: network,
        lpDeployer: LP_DEPLOYER,
        usdc: USDC,
    }));

    console.log(`\n📝 Next Steps:`);
    console.log(`   1. Send ${hre.ethers.formatUnits(pricePerMintUSDC * BigInt(MAX_MINT_COUNT), 6)} USDC to: ${address}`);
    console.log(`   2. Complete ${MAX_MINT_COUNT} mints`);
    console.log(`   3. Backend will automatically:`);
    console.log(`      a. Call transferAssetsForLP()`);
    console.log(`      b. Transfer tokens & USDC to ${LP_DEPLOYER}`);
    console.log(`      c. Deploy LP using LP deployer private key`);
    console.log(`\n⚠️  Make sure LP deployer address has ETH for gas!`);
    console.log(`\n🔗 View on Explorer:`);
    if (network === "baseSepolia") {
        console.log(`   https://sepolia.basescan.org/address/${address}`);
    } else {
        console.log(`   https://basescan.org/address/${address}`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

