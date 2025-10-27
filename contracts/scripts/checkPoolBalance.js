const hre = require("hardhat");

/**
 * Check the balances in the LP pool after deployment
 */
async function main() {
    const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS;

    if (!TOKEN_ADDRESS) {
        console.log("Usage: TOKEN_ADDRESS=0x... npx hardhat run scripts/checkPoolBalance.js --network baseSepolia");
        process.exit(1);
    }

    console.log(`\n💧 Checking LP Pool Balances for ${TOKEN_ADDRESS}\n`);

    const token = await hre.ethers.getContractAt("PAYX", TOKEN_ADDRESS);

    // Get token info
    const name = await token.name();
    const symbol = await token.symbol();
    const liquidityDeployed = await token.liquidityDeployed();

    console.log(`📊 Token: ${name} (${symbol})`);
    console.log(`   Address: ${TOKEN_ADDRESS}`);
    console.log(`   Liquidity Deployed: ${liquidityDeployed}\n`);

    if (!liquidityDeployed) {
        console.log("❌ Liquidity not yet deployed!");
        return;
    }

    // Get USDC address
    const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"; // Base Sepolia USDC
    const POOL_MANAGER_ADDRESS = "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408"; // Base Sepolia PoolManager

    const usdc = await hre.ethers.getContractAt("IERC20", USDC_ADDRESS);

    // Check balances in PoolManager (where liquidity is held in v4)
    const poolManagerUSDCBalance = await usdc.balanceOf(POOL_MANAGER_ADDRESS);
    const poolManagerTokenBalance = await token.balanceOf(POOL_MANAGER_ADDRESS);

    console.log(`💰 PoolManager Balances:`);
    console.log(`   USDC: ${hre.ethers.formatUnits(poolManagerUSDCBalance, 6)}`);
    console.log(`   ${symbol}: ${hre.ethers.formatEther(poolManagerTokenBalance)}`);

    // Check contract balances (should be zero after LP deployment)
    const contractUSDCBalance = await usdc.balanceOf(TOKEN_ADDRESS);
    const contractTokenBalance = await token.balanceOf(TOKEN_ADDRESS);

    console.log(`\n💼 Contract Balances (should be minimal after LP):`);
    console.log(`   USDC: ${hre.ethers.formatUnits(contractUSDCBalance, 6)}`);
    console.log(`   ${symbol}: ${hre.ethers.formatEther(contractTokenBalance)}`);

    // Analysis
    console.log(`\n📋 Analysis:`);
    if (poolManagerTokenBalance > 0 && poolManagerUSDCBalance > 0) {
        console.log(`   ✅ Both tokens are in the pool!`);
        const ratio = Number(poolManagerUSDCBalance) / 1e6 / (Number(poolManagerTokenBalance) / 1e18);
        console.log(`   📊 Price: 1 ${symbol} = ${ratio.toFixed(6)} USDC`);
    } else if (poolManagerUSDCBalance > 0 && poolManagerTokenBalance == 0) {
        console.log(`   ❌ Only USDC in pool - token was not added!`);
        console.log(`   💡 This means token approval or transfer failed`);
    } else if (poolManagerTokenBalance > 0 && poolManagerUSDCBalance == 0) {
        console.log(`   ❌ Only ${symbol} in pool - USDC was not added!`);
    } else {
        console.log(`   ❌ No liquidity found in PoolManager!`);
        console.log(`   💡 Check if liquidity is in a different location`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

