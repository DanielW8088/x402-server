
const hre = require("hardhat");

async function main() {
    const TOKEN_NAME = "19";
    const TOKEN_SYMBOL = "19";
    const MINT_AMOUNT = "10000000000000000000000";
    const MAX_MINT_COUNT = 100000;
    
    const PAYMENT_TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
    const PRICE_PER_MINT = "1000000";
    const POOL_SEED_AMOUNT = "250000000000000000000000000";
    const EXCESS_RECIPIENT = "0x3a3e5a61818ff6d583c1aeb3f44fdd6e010440b4";
    const LP_DEPLOYER = "0xf7a66e2749152cc77f9F56a679EE7A1A9F5806aF";

    console.log("Deploying PAYX_Simple token:", TOKEN_NAME);
    console.log("LP Deployer:", LP_DEPLOYER);
    
    const PAYX = await hre.ethers.getContractFactory("PAYX_Simple");
    const token = await PAYX.deploy(
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
