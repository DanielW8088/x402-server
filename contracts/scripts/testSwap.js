/**
 * Test swap on deployed pool
 * 
 * Usage:
 *   POOL_ADDRESS=0x... AMOUNT_IN=1 npx hardhat run scripts/testSwap.js --network baseSepolia
 * 
 * This script simulates a swap (doesn't actually execute) to verify pool functionality
 */

const hre = require("hardhat");

const QUOTER_ABI = [
    "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)",
];

const POOL_ABI = [
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function fee() view returns (uint24)",
];

const ERC20_ABI = [
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
];

async function main() {
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║              Test Swap Quote (Simulation)                ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");

    const POOL_ADDRESS = process.env.POOL_ADDRESS || "0xCFEB5A4ed2c4cbc1615B32CFf626dD48b5D2d23f";
    const AMOUNT_IN = process.env.AMOUNT_IN || "1"; // In USDC

    const chain = await hre.ethers.provider.getNetwork();
    const chainId = chain.chainId;

    // Quoter V2 addresses
    const QUOTER_ADDRESS = chainId === 84532n
        ? "0xC5290058841028F1614F3A6F0F5816cAd0df5E27" // Base Sepolia
        : "0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a"; // Base mainnet

    console.log(`📍 Network: ${hre.network.name}`);
    console.log(`🏊 Pool: ${POOL_ADDRESS}`);
    console.log(`💱 Quoter: ${QUOTER_ADDRESS}\n`);

    const [signer] = await hre.ethers.getSigners();
    const pool = new hre.ethers.Contract(POOL_ADDRESS, POOL_ABI, hre.ethers.provider);

    const token0Address = await pool.token0();
    const token1Address = await pool.token1();
    const fee = await pool.fee();

    const token0 = new hre.ethers.Contract(token0Address, ERC20_ABI, hre.ethers.provider);
    const token1 = new hre.ethers.Contract(token1Address, ERC20_ABI, hre.ethers.provider);

    const [symbol0, decimals0, symbol1, decimals1] = await Promise.all([
        token0.symbol(),
        token0.decimals(),
        token1.symbol(),
        token1.decimals(),
    ]);

    console.log("💎 Pool Tokens:");
    console.log(`  Token0: ${symbol0} (${decimals0} decimals)`);
    console.log(`  Token1: ${symbol1} (${decimals1} decimals)\n`);

    // Test swap: USDC -> Token
    const amountIn = hre.ethers.parseUnits(AMOUNT_IN, decimals0);
    console.log(`🔄 Simulating Swap:`);
    console.log(`  Input: ${AMOUNT_IN} ${symbol0}`);
    console.log(`  Expected output: ??? ${symbol1}\n`);

    try {
        const quoter = new hre.ethers.Contract(QUOTER_ADDRESS, QUOTER_ABI, signer);

        console.log("⏳ Calling Quoter V2...");
        const amountOut = await quoter.quoteExactInputSingle.staticCall(
            token0Address,
            token1Address,
            fee,
            amountIn,
            0 // sqrtPriceLimitX96 = 0 (no limit)
        );

        console.log(`✅ Quote successful!\n`);
        console.log(`📊 Swap Result:`);
        console.log(`  Input: ${AMOUNT_IN} ${symbol0}`);
        console.log(`  Output: ${hre.ethers.formatUnits(amountOut, decimals1)} ${symbol1}`);
        console.log(`  Price: 1 ${symbol0} = ${Number(hre.ethers.formatUnits(amountOut, decimals1)) / Number(AMOUNT_IN)} ${symbol1}\n`);

        console.log("✅ Pool is functional and ready for swaps!");
        console.log("\n💡 To perform an actual swap, use Uniswap interface:");
        console.log(`   https://app.uniswap.org/#/swap?chain=base_sepolia`);

    } catch (error) {
        console.error("❌ Quote failed:");
        console.error(error.message);
        console.log("\nThis might mean:");
        console.log("  - Pool needs more liquidity");
        console.log("  - Price impact too high for the swap amount");
        console.log("  - Quoter address might be incorrect for this network");
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

