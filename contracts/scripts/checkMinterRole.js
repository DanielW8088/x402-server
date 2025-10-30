const hre = require("hardhat");
require("dotenv").config();

/**
 * Check if an address has MINTER_ROLE
 * Usage: 
 *   npx hardhat run scripts/checkMinterRole.js --network base
 *   npx hardhat run scripts/checkMinterRole.js --network baseSepolia
 */
async function main() {
    // Get contract address from command line or env
    const tokenAddress = process.env.TOKEN_ADDRESS || process.argv[2];

    if (!tokenAddress) {
        console.error("❌ Error: TOKEN_ADDRESS not provided");
        console.error("Usage:");
        console.error("  TOKEN_ADDRESS=0x... npx hardhat run scripts/checkMinterRole.js --network base");
        console.error("  OR");
        console.error("  npx hardhat run scripts/checkMinterRole.js --network base 0x...");
        process.exit(1);
    }

    // Get server address from SERVER_PRIVATE_KEY
    const serverPrivateKey = process.env.SERVER_PRIVATE_KEY;
    if (!serverPrivateKey) {
        console.error("❌ Error: SERVER_PRIVATE_KEY not found in .env");
        console.error("Please set SERVER_PRIVATE_KEY in your .env file");
        process.exit(1);
    }

    // Derive server address from private key
    const serverWallet = new hre.ethers.Wallet(serverPrivateKey);
    const serverAddress = serverWallet.address;

    console.log("\n🔍 Checking MINTER_ROLE");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Token Contract:", tokenAddress);
    console.log("Server Address:", serverAddress);

    // Get contract instance
    const token = await hre.ethers.getContractAt("X402Token", tokenAddress);

    // Get MINTER_ROLE hash
    const MINTER_ROLE = await token.MINTER_ROLE();
    const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();

    console.log("\n📋 Role Information:");
    console.log("MINTER_ROLE:", MINTER_ROLE);
    console.log("DEFAULT_ADMIN_ROLE:", DEFAULT_ADMIN_ROLE);

    // Check roles
    const hasMinterRole = await token.hasRole(MINTER_ROLE, serverAddress);
    const hasAdminRole = await token.hasRole(DEFAULT_ADMIN_ROLE, serverAddress);

    console.log("\n✅ Role Check Results:");
    console.log("Has MINTER_ROLE:", hasMinterRole ? "✅ YES" : "❌ NO");
    console.log("Has DEFAULT_ADMIN_ROLE:", hasAdminRole ? "✅ YES" : "❌ NO");

    // Get deployer info
    const deployer = (await hre.ethers.provider.getSigner()).address;
    console.log("\n👤 Current Deployer:", deployer);
    const deployerHasMinter = await token.hasRole(MINTER_ROLE, deployer);
    const deployerHasAdmin = await token.hasRole(DEFAULT_ADMIN_ROLE, deployer);
    console.log("Deployer has MINTER_ROLE:", deployerHasMinter ? "✅ YES" : "❌ NO");
    console.log("Deployer has DEFAULT_ADMIN_ROLE:", deployerHasAdmin ? "✅ YES" : "❌ NO");

    // Get token info
    console.log("\n📊 Token Information:");
    const mintCount = await token.mintCount();
    const maxMintCount = await token.maxMintCount();
    const mintAmount = await token.mintAmount();
    const remainingSupply = await token.remainingSupply();

    console.log("Mint count:", mintCount.toString(), "/", maxMintCount.toString());
    console.log("Mint amount:", hre.ethers.formatUnits(mintAmount, 18), "tokens");
    console.log("Remaining supply:", hre.ethers.formatUnits(remainingSupply, 18), "tokens");

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    if (!hasMinterRole) {
        console.log("⚠️  To grant MINTER_ROLE, run:");
        console.log(`   TOKEN_ADDRESS=${tokenAddress} npx hardhat run scripts/grantMinterRole.js --network ${hre.network.name}`);
        console.log();
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Error:", error);
        process.exit(1);
    });

