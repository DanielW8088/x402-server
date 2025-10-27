const hre = require("hardhat");

/**
 * Manual LP deployment for tokens where pool is already initialized
 * but liquidity deployment failed
 */
async function main() {
    const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || "0xb4d37e0e81eca7b3bdad2abd446c5a4c6cdb1974";
    const FEE = process.env.FEE || 10000; // 1%
    const TICK_SPACING = process.env.TICK_SPACING || 200;

    console.log(`\n💧 Manual LP Deployment`);
    console.log(`Token: ${TOKEN_ADDRESS}`);
    console.log(`Fee: ${FEE} (${FEE / 10000}%)`);
    console.log(`Tick Spacing: ${TICK_SPACING}\n`);

    const [deployer] = await hre.ethers.getSigners();
    console.log(`Deployer: ${deployer.address}\n`);

    // Get token contract
    const token = await hre.ethers.getContractAt("PAYX", TOKEN_ADDRESS);

    // Check status
    const mintCount = await token.mintCount();
    const maxMintCount = await token.maxMintCount();
    const liquidityDeployed = await token.liquidityDeployed();

    console.log(`📊 Current Status:`);
    console.log(`   Mint Count: ${mintCount} / ${maxMintCount}`);
    console.log(`   Liquidity Deployed: ${liquidityDeployed}`);

    if (liquidityDeployed) {
        console.log(`\n❌ Liquidity already deployed!`);
        return;
    }

    if (mintCount < maxMintCount) {
        console.log(`\n❌ Minting not complete yet (${mintCount}/${maxMintCount})`);
        return;
    }

    console.log(`\n✅ Ready for LP deployment\n`);

    // Deploy LP
    console.log(`🚀 Deploying LP...`);
    const tx = await token.initializePoolAndDeployLiquidity(FEE, TICK_SPACING, {
        gasLimit: 3000000,
    });

    console.log(`   TX sent: ${tx.hash}`);
    console.log(`   Waiting for confirmation...`);

    const receipt = await tx.wait();

    if (receipt.status === 0) {
        console.log(`\n❌ Transaction reverted!`);
        console.log(`   TX: ${tx.hash}`);
        process.exit(1);
    }

    console.log(`\n✅ LP deployed successfully!`);
    console.log(`   Block: ${receipt.blockNumber}`);
    console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
    console.log(`   TX: ${tx.hash}`);

    // Verify
    const liquidityDeployedAfter = await token.liquidityDeployed();
    console.log(`\n📊 Final Status:`);
    console.log(`   Liquidity Deployed: ${liquidityDeployedAfter}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

