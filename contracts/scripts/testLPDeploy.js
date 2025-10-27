const hre = require("hardhat");

/**
 * Test LP deployment by first setting hook to address(0)
 */
async function main() {
    const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || "0x8333d38d9aeb958862f6d6cd124df913ef17a095";
    const FEE = 10000;
    const TICK_SPACING = 200;

    console.log(`\n🧪 Testing LP Deployment for ${TOKEN_ADDRESS}\n`);

    const [deployer] = await hre.ethers.getSigners();
    const token = await hre.ethers.getContractAt("PAYX", TOKEN_ADDRESS);

    // Step 1: Check if hook needs to be set
    console.log(`📍 Step 1: Checking hook status...`);
    // lpGuardHook is internal, so we can't read it directly
    // But we can try to set it

    try {
        console.log(`   Attempting to set lpGuardHook to address(0)...`);
        const setHookTx = await token.setLpGuardHook(hre.ethers.ZeroAddress, {
            gasLimit: 100000
        });
        await setHookTx.wait();
        console.log(`   ✅ Hook set to address(0) (no hook)`);
    } catch (error) {
        if (error.message.includes("Hook already set")) {
            console.log(`   ℹ️  Hook already set (continuing...)`);
        } else {
            console.log(`   ⚠️  Could not set hook: ${error.message}`);
            console.log(`   (Might already be set, continuing...)`);
        }
    }

    // Step 2: Try LP deployment
    console.log(`\n📍 Step 2: Attempting LP deployment...`);
    console.log(`   Fee: ${FEE} (${FEE / 10000}%)`);
    console.log(`   Tick Spacing: ${TICK_SPACING}`);

    try {
        console.log(`   Estimating gas...`);
        const gasEstimate = await token.initializePoolAndDeployLiquidity.estimateGas(FEE, TICK_SPACING);
        console.log(`   ✅ Gas estimate: ${gasEstimate.toString()}`);

        console.log(`\n   Sending transaction...`);
        const tx = await token.initializePoolAndDeployLiquidity(FEE, TICK_SPACING, {
            gasLimit: gasEstimate * 120n / 100n, // Add 20% buffer
        });

        console.log(`   TX: ${tx.hash}`);
        console.log(`   Waiting for confirmation...`);

        const receipt = await tx.wait();

        if (receipt.status === 1) {
            console.log(`\n✅ LP deployed successfully!`);
            console.log(`   Block: ${receipt.blockNumber}`);
            console.log(`   Gas used: ${receipt.gasUsed.toString()}`);

            // Verify
            const liquidityDeployed = await token.liquidityDeployed();
            console.log(`\n📊 Verification:`);
            console.log(`   Liquidity Deployed: ${liquidityDeployed}`);
        } else {
            console.log(`\n❌ Transaction failed`);
        }
    } catch (error) {
        console.log(`\n❌ LP deployment failed`);
        console.log(`   Error: ${error.message}`);

        if (error.data) {
            console.log(`   Error data: ${error.data}`);
        }

        // Common error messages
        if (error.message.includes("PoolAlreadyInitialized")) {
            console.log(`\n   💡 Pool already initialized - this is OK with the updated contract`);
        } else if (error.message.includes("invalid address")) {
            console.log(`\n   💡 Hook address issue - address(0) might not be allowed`);
            console.log(`      Need to use a valid no-op hook contract address`);
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

