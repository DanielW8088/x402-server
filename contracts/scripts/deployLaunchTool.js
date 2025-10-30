const hre = require("hardhat");

async function main() {
    const chain = await hre.ethers.provider.getNetwork();
    console.log(`Deploying to chain ${chain.name} (${chain.chainId})`);

    // Get deployer (signer) - this will be the LaunchTool admin
    const [deployer] = await hre.ethers.getSigners();
    const LAUNCH_TOOL_ADMIN = await deployer.getAddress();

    if (!LAUNCH_TOOL_ADMIN) {
        console.error("❌ Error: Could not get deployer address");
        console.log("\nMake sure DEPLOYER_PRIVATE_KEY is set in .env file");
        process.exit(1);
    }

    let UNISWAP_V3_FACTORY = "";
    let UNISWAP_V3_POSITION_MANAGER = "";

    // Configure Uniswap V3 addresses based on network
    if (chain.chainId === 84532n) {
        // Base Sepolia testnet
        UNISWAP_V3_FACTORY = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
        UNISWAP_V3_POSITION_MANAGER = "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2";
    }
    else if (chain.chainId === 8453n) {
        // Base mainnet
        UNISWAP_V3_FACTORY = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";
        UNISWAP_V3_POSITION_MANAGER = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";
    } else {
        console.log("❌ Unsupported chain ID:", chain.chainId);
        console.log("Supported networks: Base (8453), Base Sepolia (84532)");
        throw new Error("Unsupported network");
    }

    console.log("\n" + "=".repeat(60));
    console.log("🚀 Deploying LaunchTool");
    console.log("=".repeat(60));
    console.log("Network:", chain.name, `(Chain ID: ${chain.chainId})`);
    console.log("Deployer (will be admin):", LAUNCH_TOOL_ADMIN);
    console.log("Uniswap V3 Factory:", UNISWAP_V3_FACTORY);
    console.log("Uniswap V3 Position Manager:", UNISWAP_V3_POSITION_MANAGER);
    console.log("=".repeat(60) + "\n");

    console.log("📦 Compiling contracts...");
    const LaunchTool = await hre.ethers.getContractFactory("LaunchTool");

    console.log("📤 Deploying contract...");
    const launchTool = await LaunchTool.deploy(
        UNISWAP_V3_FACTORY,
        UNISWAP_V3_POSITION_MANAGER,
        LAUNCH_TOOL_ADMIN
    );

    await launchTool.waitForDeployment();
    const address = await launchTool.getAddress();

    console.log("✅ LaunchTool deployed to:", address);
    console.log("\n⏳ Waiting for 3 block confirmations...");

    // Wait for confirmations
    const receipt = await launchTool.deploymentTransaction().wait(3);
    console.log("✅ Deployment confirmed in block:", receipt.blockNumber);

    console.log("\n" + "=".repeat(60));
    console.log("🎉 DEPLOYMENT COMPLETE!");
    console.log("=".repeat(60));
    console.log("LaunchTool Address:", address);
    console.log("Admin:", LAUNCH_TOOL_ADMIN);
    console.log("Network:", chain.name);
    console.log("=".repeat(60));

    console.log("\n📝 Next steps:");
    console.log("1. Save the LaunchTool address:", address);
    console.log("2. Use it as LAUNCH_TOOL_ADDRESS in LP deployment");
    console.log("3. Verify contract on block explorer (optional):");
    console.log(`   npx hardhat verify --network ${chain.name === 'base-sepolia' ? 'baseSepolia' : 'base'} ${address} ${UNISWAP_V3_FACTORY} ${UNISWAP_V3_POSITION_MANAGER} ${LAUNCH_TOOL_ADMIN}`);
    console.log();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}); 