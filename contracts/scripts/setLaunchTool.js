/**
 * Set LaunchTool address in X402Token contract
 * 
 * Usage:
 *   TOKEN_ADDRESS=0x... LAUNCH_TOOL_ADDRESS=0x... npx hardhat run scripts/setLaunchTool.js --network baseSepolia
 */

const hre = require("hardhat");

const TOKEN_ABI = [
    "function launchTool() view returns (address)",
    "function setLaunchTool(address) external",
    "function owner() view returns (address)",
    "function lpLive() view returns (bool)",
];

async function main() {
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║          Set LaunchTool in X402Token Contract             ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");

    const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;
    const LAUNCH_TOOL_ADDRESS = process.env.LAUNCH_TOOL_ADDRESS;

    if (!TOKEN_ADDRESS) {
        throw new Error("❌ TOKEN_ADDRESS not set!");
    }
    if (!LAUNCH_TOOL_ADDRESS) {
        throw new Error("❌ LAUNCH_TOOL_ADDRESS not set!");
    }

    const [signer] = await hre.ethers.getSigners();
    const signerAddress = await signer.getAddress();

    console.log(`📍 Network: ${hre.network.name}`);
    console.log(`🔑 Signer: ${signerAddress}`);
    console.log(`📝 Token: ${TOKEN_ADDRESS}`);
    console.log(`🛠️  LaunchTool: ${LAUNCH_TOOL_ADDRESS}\n`);

    // Connect to token contract
    const token = new hre.ethers.Contract(TOKEN_ADDRESS, TOKEN_ABI, signer);

    // Check current state
    const owner = await token.owner();
    const lpLive = await token.lpLive();
    const currentLaunchTool = await token.launchTool();

    console.log("📊 Current State:");
    console.log(`  Owner: ${owner}`);
    console.log(`  LP Live: ${lpLive}`);
    console.log(`  Current LaunchTool: ${currentLaunchTool}\n`);

    // Verify signer is owner
    if (signerAddress.toLowerCase() !== owner.toLowerCase()) {
        throw new Error(`❌ Signer ${signerAddress} is not the owner ${owner}!`);
    }

    // Verify LP is not live yet
    if (lpLive) {
        throw new Error("❌ LP is already live! Cannot change LaunchTool.");
    }

    // Check if already set to the same address
    if (currentLaunchTool.toLowerCase() === LAUNCH_TOOL_ADDRESS.toLowerCase()) {
        console.log("✅ LaunchTool is already set to the correct address!");
        return;
    }

    // Set LaunchTool
    console.log("🔧 Setting LaunchTool address...");
    const tx = await token.setLaunchTool(LAUNCH_TOOL_ADDRESS);
    console.log(`📤 Tx hash: ${tx.hash}`);
    console.log(`⏳ Waiting for confirmation...`);

    const receipt = await tx.wait(2);
    console.log(`✅ Confirmed in block ${receipt.blockNumber}\n`);

    // Verify
    const newLaunchTool = await token.launchTool();
    console.log("🔍 Verification:");
    console.log(`  New LaunchTool: ${newLaunchTool}`);

    if (newLaunchTool.toLowerCase() === LAUNCH_TOOL_ADDRESS.toLowerCase()) {
        console.log("\n╔════════════════════════════════════════════════════════════╗");
        console.log("║                    ✅ SUCCESS!                             ║");
        console.log("╚════════════════════════════════════════════════════════════╝");
        console.log("\n🎉 LaunchTool is now whitelisted for token transfers!");
        console.log("   LaunchTool can now transfer tokens to PositionManager before LP is live.\n");
    } else {
        console.log("\n❌ Verification failed! LaunchTool address mismatch.");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("\n❌ Error:");
        console.error(error);
        process.exit(1);
    });

