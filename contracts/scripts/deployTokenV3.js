const hre = require("hardhat");

/**
 * Deploy PAYX token with proper configuration (Uniswap V3)
 * 
 * Environment variables:
 * - TOKEN_NAME: Token name
 * - TOKEN_SYMBOL: Token symbol  
 * - MINT_AMOUNT: Tokens per mint (e.g., "1000")
 * - MAX_MINT_COUNT: Max number of mints (e.g., 10)
 * - PRICE: Price in USDC (e.g., "1")
 * - EXCESS_RECIPIENT: Address to receive excess USDC
 */
async function main() {
    const TOKEN_NAME = process.env.TOKEN_NAME || "Test Token";
    const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL || "TTK";
    const MINT_AMOUNT = process.env.MINT_AMOUNT || "1000";
    const MAX_MINT_COUNT = parseInt(process.env.MAX_MINT_COUNT || "10");
    const PRICE = process.env.PRICE || "1";
    const EXCESS_RECIPIENT = process.env.EXCESS_RECIPIENT;
    
    const [deployer] = await hre.ethers.getSigners();
    
    if (!EXCESS_RECIPIENT) {
        console.error("❌ EXCESS_RECIPIENT environment variable required");
        process.exit(1);
    }
    
    console.log(`\n🚀 Deploying PAYX Token (Uniswap V3)`);
    console.log(`   Deployer: ${deployer.address}`);
    console.log(`   Name: ${TOKEN_NAME}`);
    console.log(`   Symbol: ${TOKEN_SYMBOL}`);
    console.log(`   Mint Amount: ${MINT_AMOUNT} tokens`);
    console.log(`   Max Mints: ${MAX_MINT_COUNT}`);
    console.log(`   Price: ${PRICE} USDC`);
    console.log(`   Excess Recipient: ${EXCESS_RECIPIENT}\n`);
    
    // Network configuration
    const network = hre.network.name;
    let POSITION_MANAGER, USDC;
    
    if (network === "baseSepolia") {
        POSITION_MANAGER = "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2";
        USDC = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
    } else if (network === "base") {
        POSITION_MANAGER = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";
        USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
    } else {
        console.error(`❌ Unsupported network: ${network}`);
        process.exit(1);
    }
    
    console.log(`📍 Network: ${network}`);
    console.log(`   Position Manager: ${POSITION_MANAGER}`);
    console.log(`   USDC: ${USDC}\n`);
    
    // Calculate amounts
    const mintAmountWei = hre.ethers.parseEther(MINT_AMOUNT);
    const totalUserMint = mintAmountWei * BigInt(MAX_MINT_COUNT);
    const poolSeedAmount = totalUserMint / 4n; // 20% for LP
    const pricePerMintUSDC = hre.ethers.parseUnits(PRICE, 6);
    
    // Pool configuration
    const POOL_FEE = 3000; // 0.3% - most common tier
    
    console.log(`💰 Token Economics:`);
    console.log(`   Total User Mintable: ${hre.ethers.formatEther(totalUserMint)} tokens (80%)`);
    console.log(`   LP Pool Reserve: ${hre.ethers.formatEther(poolSeedAmount)} tokens (20%)`);
    console.log(`   USDC Required for LP: ${hre.ethers.formatUnits(poolSeedAmount * pricePerMintUSDC / mintAmountWei, 6)} USDC`);
    console.log(`   Total USDC Revenue: ${hre.ethers.formatUnits(pricePerMintUSDC * BigInt(MAX_MINT_COUNT), 6)} USDC`);
    console.log(`   Pool Fee: ${POOL_FEE / 10000}%\n`);
    
    // Deploy contract
    console.log(`🔨 Deploying contract...`);
    const PAYX = await hre.ethers.getContractFactory("PAYX");
    const token = await PAYX.deploy(
        TOKEN_NAME,
        TOKEN_SYMBOL,
        mintAmountWei,
        MAX_MINT_COUNT,
        POSITION_MANAGER,
        USDC,
        pricePerMintUSDC,
        poolSeedAmount,
        EXCESS_RECIPIENT,
        POOL_FEE
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
        positionManager: POSITION_MANAGER,
        usdc: USDC,
        poolFee: POOL_FEE,
    }));
    
    console.log(`\n📝 Next Steps:`);
    console.log(`   1. Send ${hre.ethers.formatUnits(pricePerMintUSDC * BigInt(MAX_MINT_COUNT), 6)} USDC to: ${address}`);
    console.log(`   2. Complete ${MAX_MINT_COUNT} mints`);
    console.log(`   3. LP will auto-deploy after all mints complete`);
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

