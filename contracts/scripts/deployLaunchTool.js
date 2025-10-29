const hre = require("hardhat");

async function main() {
    const chain = await hre.ethers.provider.getNetwork();
    console.log(`Deploying to chain ${chain.name} (${chain.chainId})`);

    const LAUNCH_TOOL_ADMIN = "0xf7a66e2749152cc77f9F56a679EE7A1A9F5806aF";
    let UNISWAP_V3_FACTORY = ""; 
    let UNISWAP_V3_POSITION_MANAGER = ""; 

    // if deploy on base sepolia
    if (chain.chainId === 84532n) {
        // Use a different admin for base sepolia
        UNISWAP_V3_FACTORY = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
        UNISWAP_V3_POSITION_MANAGER = "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2";
    }
    else if (chain.chainId === 8453n) {
        // Use the mainnet admin
        UNISWAP_V3_FACTORY = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";
        UNISWAP_V3_POSITION_MANAGER = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";
    } else {
        console.log("Unsupported chain ID:", chain.chainId);
        throw new Error("Unsupported network");
    }

    console.log("Deploying LaunchTool");
    console.log("Admin Address:", LAUNCH_TOOL_ADMIN);
    console.log("Uniswap V3 Factory:", UNISWAP_V3_FACTORY);
    console.log("Uniswap V3 Position Manager:", UNISWAP_V3_POSITION_MANAGER);
    
    
    const LaunchTool = await hre.ethers.getContractFactory("LaunchTool");
    const launchTool = await LaunchTool.deploy(
        UNISWAP_V3_FACTORY,
        UNISWAP_V3_POSITION_MANAGER,
        LAUNCH_TOOL_ADMIN
    );

    await launchTool.waitForDeployment();
    const address = await launchTool.getAddress();
    
    console.log("LaunchTool deployed to:", address);
    
    // Wait for confirmations
    const receipt = await launchTool.deploymentTransaction().wait(3);
    console.log("Deployment confirmed in block:", receipt.blockNumber);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
}); 