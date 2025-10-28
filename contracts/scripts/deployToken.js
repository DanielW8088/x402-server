
const hre = require("hardhat");

async function main() {
    const TOKEN_NAME = "30";
    const TOKEN_SYMBOL = "30";
    const MINT_AMOUNT = "10000000000000000000000";
    const MAX_MINT_COUNT = 10;

    const PAYMENT_TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
    const PRICE_PER_MINT = "1000000";
    const POOL_SEED_AMOUNT = "25000000000000000000000";
    const EXCESS_RECIPIENT = "0x3a3e5a61818ff6d583c1aeb3f44fdd6e010440b4";
    const LP_DEPLOYER = "0xf7a66e2749152cc77f9F56a679EE7A1A9F5806aF";
    const SERVER_ADDRESS = "0x130777E1166C89A9CD539f6E8eE86F5C615BCff7";

    console.log("Deploying X402Token:", TOKEN_NAME);
    console.log("LP Deployer:", LP_DEPLOYER);
    console.log("Server Address:", SERVER_ADDRESS);

    const X402Token = await hre.ethers.getContractFactory("X402Token");
    const token = await X402Token.deploy(
        TOKEN_NAME,
        TOKEN_SYMBOL,
        MINT_AMOUNT,
        MAX_MINT_COUNT,
        PAYMENT_TOKEN,
        PRICE_PER_MINT,
        POOL_SEED_AMOUNT,
        EXCESS_RECIPIENT,
        LP_DEPLOYER
    );

    await token.waitForDeployment();
    const address = await token.getAddress();

    console.log("Token deployed to:", address);

    // Wait for confirmations
    const receipt = await token.deploymentTransaction().wait(3);
    console.log("Deployment confirmed in block:", receipt.blockNumber);

    // Grant MINTER_ROLE to server address
    console.log("\n🔐 Granting MINTER_ROLE to server...");
    const MINTER_ROLE = await token.MINTER_ROLE();

    // Check if already has role
    const hasRole = await token.hasRole(MINTER_ROLE, SERVER_ADDRESS);
    if (hasRole) {
        console.log("✅ Server already has MINTER_ROLE");
    } else {
        const grantTx = await token.grantRole(MINTER_ROLE, SERVER_ADDRESS);
        console.log("Grant role tx:", grantTx.hash);
        console.log("⏳ Waiting for confirmation...");
        await grantTx.wait(2); // Wait for 2 confirmations
        console.log("✅ MINTER_ROLE transaction confirmed");
    }

    // Verify role with retry logic
    console.log("🔍 Verifying role...");
    let hasRoleAfter = false;
    for (let i = 0; i < 3; i++) {
        hasRoleAfter = await token.hasRole(MINTER_ROLE, SERVER_ADDRESS);
        if (hasRoleAfter) {
            console.log("✅ MINTER_ROLE verified successfully");
            break;
        }
        if (i < 2) {
            console.log(`   Retry ${i + 1}/2 - waiting 2 seconds...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    if (!hasRoleAfter) {
        console.error("⚠️  Warning: Role verification failed, but transaction was confirmed.");
        console.error("   This may be due to RPC node sync delay.");
        console.error("   The deployment was successful. Role can be verified manually.");
        // Don't throw error - deployment was successful
    }

    // Output JSON for parsing
    console.log("DEPLOY_RESULT:", JSON.stringify({
        address: address,
        txHash: receipt.hash,
        blockNumber: receipt.blockNumber
    }));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
