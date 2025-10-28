const hre = require("hardhat");
require("dotenv").config();

/**
 * Grant MINTER_ROLE to SERVER_PRIVATE_KEY address
 * Usage: 
 *   npx hardhat run scripts/grantMinterRole.js --network base
 *   npx hardhat run scripts/grantMinterRole.js --network baseSepolia
 */
async function main() {
    // Get contract address from command line or env
    const tokenAddress = process.env.TOKEN_ADDRESS || process.argv[2];

    if (!tokenAddress) {
        console.error("❌ Error: TOKEN_ADDRESS not provided");
        console.error("Usage:");
        console.error("  TOKEN_ADDRESS=0x... npx hardhat run scripts/grantMinterRole.js --network base");
        console.error("  OR");
        console.error("  npx hardhat run scripts/grantMinterRole.js --network base 0x...");
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

    console.log("\n🔐 Granting MINTER_ROLE");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("Token Contract:", tokenAddress);
    console.log("Server Address:", serverAddress);
    console.log("Deployer:", (await hre.ethers.provider.getSigner()).address);

    // Get contract instance
    const token = await hre.ethers.getContractAt("X402Token", tokenAddress);

    // Get MINTER_ROLE hash
    const MINTER_ROLE = await token.MINTER_ROLE();
    console.log("MINTER_ROLE:", MINTER_ROLE);

    // Check if already has role
    const hasRole = await token.hasRole(MINTER_ROLE, serverAddress);
    if (hasRole) {
        console.log("✅ Address already has MINTER_ROLE");
        return;
    }

    console.log("\n⏳ Granting role...");

    // Grant role
    const tx = await token.grantRole(MINTER_ROLE, serverAddress);
    console.log("Transaction hash:", tx.hash);

    console.log("⏳ Waiting for confirmation...");
    const receipt = await tx.wait();

    console.log("✅ Role granted successfully!");
    console.log("Block:", receipt.blockNumber);
    console.log("Gas used:", receipt.gasUsed.toString());

    // Verify
    const hasRoleAfter = await token.hasRole(MINTER_ROLE, serverAddress);
    console.log("\n🔍 Verification:");
    console.log("Has MINTER_ROLE:", hasRoleAfter ? "✅ YES" : "❌ NO");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Error:", error);
        process.exit(1);
    });

