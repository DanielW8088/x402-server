const hre = require("hardhat");

async function main() {
    // Token address from deployment
    const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || "0xb4d37e0e81eca7b3bdad2abd446c5a4c6cdb1974";

    console.log(`\n🔍 Checking token ${TOKEN_ADDRESS}...`);

    const token = await hre.ethers.getContractAt("PAYX", TOKEN_ADDRESS);
    const [deployer] = await hre.ethers.getSigners();

    console.log(`\n📊 Token State:`);

    // Check mint status
    const mintCount = await token.mintCount();
    const maxMintCount = await token.maxMintCount();
    const liquidityDeployed = await token.liquidityDeployed();
    console.log(`   Mint Count: ${mintCount} / ${maxMintCount}`);
    console.log(`   Liquidity Deployed: ${liquidityDeployed}`);

    // Check roles
    const DEFAULT_ADMIN_ROLE = await token.DEFAULT_ADMIN_ROLE();
    const hasAdminRole = await token.hasRole(DEFAULT_ADMIN_ROLE, deployer.address);
    console.log(`\n🔑 Roles for ${deployer.address}:`);
    console.log(`   Has DEFAULT_ADMIN_ROLE: ${hasAdminRole}`);

    // Check balances
    const tokenBalance = await token.balanceOf(TOKEN_ADDRESS);
    console.log(`\n💰 Contract Balances:`);
    console.log(`   Token Balance: ${hre.ethers.formatEther(tokenBalance)} tokens`);

    // Check USDC balance
    const paymentToken = await token.PAYMENT_TOKEN();
    const usdc = await hre.ethers.getContractAt("IERC20", paymentToken);
    const usdcBalance = await usdc.balanceOf(TOKEN_ADDRESS);
    console.log(`   USDC Balance: ${hre.ethers.formatUnits(usdcBalance, 6)} USDC`);

    // Check required amounts
    const poolSeedAmount = await token.POOL_SEED_AMOUNT();
    const pricePerMint = await token.PRICE_PER_MINT();
    const mintAmount = await token.MINT_AMOUNT();

    const requiredUSDC = poolSeedAmount * pricePerMint / mintAmount;
    console.log(`\n📐 Required for LP:`);
    console.log(`   Token Required: ${hre.ethers.formatEther(poolSeedAmount)} tokens`);
    console.log(`   USDC Required: ${hre.ethers.formatUnits(requiredUSDC, 6)} USDC`);

    // Check if ready
    const hasEnoughTokens = tokenBalance >= poolSeedAmount;
    const hasEnoughUSDC = usdcBalance >= requiredUSDC;
    const mintComplete = mintCount >= maxMintCount;
    const notDeployed = !liquidityDeployed;

    console.log(`\n✅ Readiness Check:`);
    console.log(`   ✓ Mint Complete: ${mintComplete ? '✅' : '❌'}`);
    console.log(`   ✓ Not Deployed Yet: ${notDeployed ? '✅' : '❌'}`);
    console.log(`   ✓ Has Admin Role: ${hasAdminRole ? '✅' : '❌'}`);
    console.log(`   ✓ Enough Tokens: ${hasEnoughTokens ? '✅' : '❌'}`);
    console.log(`   ✓ Enough USDC: ${hasEnoughUSDC ? '✅' : '❌'}`);

    const isReady = mintComplete && notDeployed && hasAdminRole && hasEnoughTokens && hasEnoughUSDC;
    console.log(`\n${isReady ? '🎉 Ready for LP deployment!' : '❌ NOT ready for LP deployment'}`);

    if (!isReady) {
        console.log(`\n🔧 Issues to fix:`);
        if (!mintComplete) console.log(`   - Complete minting (${mintCount}/${maxMintCount})`);
        if (liquidityDeployed) console.log(`   - Liquidity already deployed`);
        if (!hasAdminRole) console.log(`   - Grant DEFAULT_ADMIN_ROLE to ${deployer.address}`);
        if (!hasEnoughTokens) console.log(`   - Contract needs ${hre.ethers.formatEther(poolSeedAmount - tokenBalance)} more tokens`);
        if (!hasEnoughUSDC) console.log(`   - Contract needs ${hre.ethers.formatUnits(requiredUSDC - usdcBalance, 6)} more USDC`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

