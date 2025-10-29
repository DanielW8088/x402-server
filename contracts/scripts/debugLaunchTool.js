/**
 * Debug LaunchTool Script
 * Check LaunchTool configuration and permissions
 * 
 * Usage:
 *   LAUNCH_TOOL_ADDRESS=0x... TOKEN_ADDRESS=0x... npx hardhat run scripts/debugLaunchTool.js --network baseSepolia
 */

const hre = require("hardhat");
const { ethers } = hre;

const LAUNCH_TOOL_ADDRESS = process.env.LAUNCH_TOOL_ADDRESS;
const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

const LAUNCH_TOOL_ABI = [
    "function admin() view returns (address)",
    "function uniswapV3Factory() view returns (address)",
    "function positionManager() view returns (address)",
];

const FACTORY_ABI = [
    "function getPool(address,address,uint24) view returns (address)",
];

const X402_ABI = [
    "function owner() view returns (address)",
    "function lpDeployer() view returns (address)",
    "function lpLive() view returns (bool)",
    "function mintingCompleted() view returns (bool)",
    "function assetsTransferred() view returns (bool)",
];

async function main() {
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║            LaunchTool Debug Information                   ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");

    if (!LAUNCH_TOOL_ADDRESS) {
        console.error("❌ Please set LAUNCH_TOOL_ADDRESS");
        process.exit(1);
    }

    const [signer] = await ethers.getSigners();
    const signerAddress = await signer.getAddress();

    const chain = await ethers.provider.getNetwork();

    console.log(`Network: ${chain.name} (${chain.chainId})`);
    console.log(`Signer: ${signerAddress}`);
    console.log(`LaunchTool: ${LAUNCH_TOOL_ADDRESS}\n`);

    // Check LaunchTool
    const launchTool = new ethers.Contract(LAUNCH_TOOL_ADDRESS, LAUNCH_TOOL_ABI, ethers.provider);

    console.log("=".repeat(60));
    console.log("LaunchTool Configuration");
    console.log("=".repeat(60));

    const admin = await launchTool.admin();
    const factory = await launchTool.uniswapV3Factory();
    const positionManager = await launchTool.positionManager();

    console.log(`Admin: ${admin}`);
    console.log(`Factory: ${factory}`);
    console.log(`Position Manager: ${positionManager}`);

    console.log(`\n✅ Signer is admin: ${signerAddress.toLowerCase() === admin.toLowerCase()}`);

    if (signerAddress.toLowerCase() !== admin.toLowerCase()) {
        console.log(`\n❌ ERROR: Signer is not LaunchTool admin!`);
        console.log(`  Expected admin: ${admin}`);
        console.log(`  Current signer: ${signerAddress}`);
        console.log(`\n💡 Solution: Use the admin account to call configurePoolByAmount`);
    }

    // Check if pool already exists
    if (TOKEN_ADDRESS) {
        console.log("\n" + "=".repeat(60));
        console.log("Pool Status Check");
        console.log("=".repeat(60));

        const factoryContract = new ethers.Contract(factory, FACTORY_ABI, ethers.provider);

        const feeTiers = [500, 3000, 10000];
        let token0, token1;

        if (USDC_ADDRESS.toLowerCase() < TOKEN_ADDRESS.toLowerCase()) {
            token0 = USDC_ADDRESS;
            token1 = TOKEN_ADDRESS;
        } else {
            token0 = TOKEN_ADDRESS;
            token1 = USDC_ADDRESS;
        }

        console.log(`Token0: ${token0}`);
        console.log(`Token1: ${token1}\n`);

        for (const fee of feeTiers) {
            const pool = await factoryContract.getPool(token0, token1, fee);
            const exists = pool !== ethers.ZeroAddress;
            console.log(`Fee ${fee / 10000}%: ${exists ? `✅ Exists (${pool})` : '❌ Not created'}`);

            if (exists) {
                console.log(`  ⚠️  Pool already exists! LaunchTool will revert with PoolAlreadyExists`);
            }
        }

        // Check X402Token status
        console.log("\n" + "=".repeat(60));
        console.log("X402Token Status");
        console.log("=".repeat(60));

        const token = new ethers.Contract(TOKEN_ADDRESS, X402_ABI, ethers.provider);

        const owner = await token.owner();
        const lpDeployer = await token.lpDeployer();
        const lpLive = await token.lpLive();
        const mintingCompleted = await token.mintingCompleted();
        const assetsTransferred = await token.assetsTransferred();

        console.log(`Owner: ${owner}`);
        console.log(`LP Deployer: ${lpDeployer}`);
        console.log(`LP Live: ${lpLive}`);
        console.log(`Minting Completed: ${mintingCompleted}`);
        console.log(`Assets Transferred: ${assetsTransferred}`);

        console.log(`\n✅ Signer is LP Deployer: ${signerAddress.toLowerCase() === lpDeployer.toLowerCase()}`);
        console.log(`✅ Signer is Owner: ${signerAddress.toLowerCase() === owner.toLowerCase()}`);

        if (lpLive) {
            console.log(`\n⚠️  WARNING: LP is already live! Cannot deploy again.`);
        }

        if (!mintingCompleted && !assetsTransferred) {
            console.log(`\n⚠️  WARNING: Assets not transferred yet. Call transferAssetsForLP() first.`);
        }
    }

    console.log("\n" + "=".repeat(60));
    console.log("Summary");
    console.log("=".repeat(60));

    const issues = [];

    if (signerAddress.toLowerCase() !== admin.toLowerCase()) {
        issues.push("❌ Signer is not LaunchTool admin");
    }

    if (TOKEN_ADDRESS) {
        const token = new ethers.Contract(TOKEN_ADDRESS, X402_ABI, ethers.provider);
        const lpLive = await token.lpLive();
        if (lpLive) {
            issues.push("❌ LP is already live");
        }
    }

    if (issues.length === 0) {
        console.log("✅ All checks passed! Ready to deploy LP.");
    } else {
        console.log("Issues found:");
        issues.forEach(issue => console.log(`  ${issue}`));
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

