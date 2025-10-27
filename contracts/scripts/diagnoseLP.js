const hre = require("hardhat");

async function main() {
    const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || "0x8333d38d9aeb958862f6d6cd124df913ef17a095";

    console.log(`\n🔍 Diagnosing LP deployment for ${TOKEN_ADDRESS}...\n`);

    const [deployer] = await hre.ethers.getSigners();
    const token = await hre.ethers.getContractAt("PAYX", TOKEN_ADDRESS);

    // 1. Check basic state
    console.log(`📊 Basic State:`);
    const mintCount = await token.mintCount();
    const maxMintCount = await token.maxMintCount();
    const liquidityDeployed = await token.liquidityDeployed();
    console.log(`   Mint Count: ${mintCount} / ${maxMintCount}`);
    console.log(`   Liquidity Deployed: ${liquidityDeployed}`);

    // 2. Check roles
    console.log(`\n🔑 Roles:`);
    const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
    const hasAdminRole = await token.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
    console.log(`   Deployer ${deployer.address}`);
    console.log(`   Has DEFAULT_ADMIN_ROLE: ${hasAdminRole}`);

    // 3. Check balances
    console.log(`\n💰 Balances:`);
    const tokenBalance = await token.balanceOf(TOKEN_ADDRESS);
    console.log(`   Token Balance: ${hre.ethers.formatEther(tokenBalance)}`);

    // 4. Try to read immutable values via storage
    console.log(`\n🔧 Trying to estimate gas...`);
    try {
        const gasEstimate = await token.initializePoolAndDeployLiquidity.estimateGas(10000, 200);
        console.log(`   ✅ Gas estimate: ${gasEstimate.toString()}`);
    } catch (error) {
        console.log(`   ❌ Gas estimation failed`);
        console.log(`   Error: ${error.message}`);

        // Try to decode the error
        if (error.data) {
            console.log(`\n   Error data: ${error.data}`);

            // Check if it's a known error
            const errorSigs = {
                "0x7983c051": "PoolAlreadyInitialized()",
                "0x82b42900": "Unauthorized()",
                "0x486aa307": "PoolNotInitialized()",
                "0xf4d678b8": "InsufficientBalance()",
                "0x049f8aca": "LiquidityAlreadyDeployed()",
            };

            const errorSig = error.data.slice(0, 10);
            if (errorSigs[errorSig]) {
                console.log(`   Known error: ${errorSigs[errorSig]}`);
            }
        }
    }

    // 5. Try to call with more detailed simulation
    console.log(`\n🧪 Attempting dry-run call...`);
    try {
        await token.initializePoolAndDeployLiquidity.staticCall(10000, 200);
        console.log(`   ✅ Static call succeeded`);
    } catch (error) {
        console.log(`   ❌ Static call failed`);

        // Parse the error reason
        if (error.reason) {
            console.log(`   Reason: ${error.reason}`);
        }

        if (error.message.includes("Max mint count not reached")) {
            console.log(`   💡 Need to complete minting first`);
        } else if (error.message.includes("Liquidity already deployed")) {
            console.log(`   💡 Liquidity is already deployed`);
        } else if (error.message.includes("Unauthorized") || error.message.includes("AccessControl")) {
            console.log(`   💡 Need DEFAULT_ADMIN_ROLE`);
        } else {
            console.log(`   💡 Unknown error - might be pool-related`);

            // Check if it's related to hook
            console.log(`\n   🪝 Checking hook configuration...`);
            console.log(`   Note: lpGuardHook might be address(0)`);
            console.log(`   This could cause issues with Uniswap v4 PoolManager`);
        }
    }

    // 6. Recommendations
    console.log(`\n📋 Recommendations:`);
    if (!hasAdminRole) {
        console.log(`   1. Grant DEFAULT_ADMIN_ROLE to deployer`);
    }
    if (mintCount < maxMintCount) {
        console.log(`   2. Complete minting (${mintCount}/${maxMintCount})`);
    }
    console.log(`   3. Consider setting lpGuardHook before deployment`);
    console.log(`      - Use setLpGuardHook() with a valid hook address`);
    console.log(`      - Or modify contract to allow address(0) as no-hook`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

