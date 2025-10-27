const hre = require("hardhat");

async function main() {
    // Get command line arguments
    const args = process.argv.slice(2);

    if (args.length < 1) {
        console.error("Usage: npx hardhat run scripts/deployLiquidity.js --network <network> -- <TOKEN_ADDRESS> [FEE] [TICK_SPACING]");
        console.error("");
        console.error("Arguments:");
        console.error("  TOKEN_ADDRESS  - Address of the deployed PAYX token");
        console.error("  FEE           - Pool fee in pips (default: 10000 = 1%)");
        console.error("  TICK_SPACING  - Tick spacing (default: 200)");
        console.error("");
        console.error("Example:");
        console.error("  npx hardhat run scripts/deployLiquidity.js --network baseSepolia -- 0x1234...5678");
        process.exit(1);
    }

    const TOKEN_ADDRESS = args[0];
    const FEE = args[1] || 10000; // 1% default
    const TICK_SPACING = args[2] || 200;

    console.log("Deploying liquidity pool for token:", TOKEN_ADDRESS);
    console.log("Fee:", FEE, "pips");
    console.log("Tick spacing:", TICK_SPACING);
    console.log("");

    // Get contract instance
    const token = await hre.ethers.getContractAt("PAYX", TOKEN_ADDRESS);

    // Check if max mint count is reached
    const mintCount = await token.mintCount();
    const maxMintCount = await token.maxMintCount();
    console.log(`Mint progress: ${mintCount} / ${maxMintCount}`);

    if (mintCount < maxMintCount) {
        console.error(`❌ Error: Max mint count not reached yet (${mintCount} / ${maxMintCount})`);
        process.exit(1);
    }

    // Check if liquidity is already deployed
    const liquidityDeployed = await token.liquidityDeployed();
    if (liquidityDeployed) {
        console.error("❌ Error: Liquidity already deployed");
        process.exit(1);
    }

    // Deploy liquidity
    console.log("Deploying liquidity pool...");
    const tx = await token.initializePoolAndDeployLiquidity(FEE, TICK_SPACING);
    console.log("Transaction sent:", tx.hash);

    // Wait for confirmation
    console.log("Waiting for confirmation...");
    const receipt = await tx.wait(3);

    console.log("");
    console.log("✅ Liquidity pool deployed successfully!");
    console.log("Transaction hash:", receipt.hash);
    console.log("Block number:", receipt.blockNumber);
    console.log("Gas used:", receipt.gasUsed.toString());

    // Parse LiquidityDeployed event
    const liquidityEvent = receipt.logs.find(log => {
        try {
            const parsed = token.interface.parseLog(log);
            return parsed.name === 'LiquidityDeployed';
        } catch {
            return false;
        }
    });

    if (liquidityEvent) {
        const parsed = token.interface.parseLog(liquidityEvent);
        console.log("");
        console.log("LP Token ID:", parsed.args.tokenId.toString());
        console.log("Liquidity:", parsed.args.liquidity.toString());
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

