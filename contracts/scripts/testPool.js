/**
 * Test deployed Uniswap V3 pool
 * 
 * Usage:
 *   POOL_ADDRESS=0x... npx hardhat run scripts/testPool.js --network baseSepolia
 */

const hre = require("hardhat");

const POOL_ABI = [
    "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)",
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function fee() view returns (uint24)",
    "function liquidity() view returns (uint128)",
];

const ERC20_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
];

async function main() {
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║              Uniswap V3 Pool Testing                      ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");

    const POOL_ADDRESS = process.env.POOL_ADDRESS || "0xCFEB5A4ed2c4cbc1615B32CFf626dD48b5D2d23f";

    console.log(`📍 Network: ${hre.network.name}`);
    console.log(`🏊 Pool: ${POOL_ADDRESS}\n`);

    const pool = new hre.ethers.Contract(POOL_ADDRESS, POOL_ABI, hre.ethers.provider);

    // Get pool info
    const [token0Address, token1Address, fee, liquidity, slot0] = await Promise.all([
        pool.token0(),
        pool.token1(),
        pool.fee(),
        pool.liquidity(),
        pool.slot0(),
    ]);

    console.log("🔍 Pool Information:");
    console.log(`  Token0: ${token0Address}`);
    console.log(`  Token1: ${token1Address}`);
    console.log(`  Fee Tier: ${fee} (${Number(fee) / 10000}%)`);
    console.log(`  Liquidity: ${liquidity.toString()}`);
    console.log(`  Current Tick: ${slot0.tick}`);
    console.log(`  sqrtPriceX96: ${slot0.sqrtPriceX96.toString()}\n`);

    // Get token info
    const token0 = new hre.ethers.Contract(token0Address, ERC20_ABI, hre.ethers.provider);
    const token1 = new hre.ethers.Contract(token1Address, ERC20_ABI, hre.ethers.provider);

    const [name0, symbol0, decimals0, name1, symbol1, decimals1] = await Promise.all([
        token0.name(),
        token0.symbol(),
        token0.decimals(),
        token1.name(),
        token1.symbol(),
        token1.decimals(),
    ]);

    console.log("💎 Token0 (typically USDC):");
    console.log(`  Name: ${name0}`);
    console.log(`  Symbol: ${symbol0}`);
    console.log(`  Decimals: ${decimals0}\n`);

    console.log("💎 Token1 (your token):");
    console.log(`  Name: ${name1}`);
    console.log(`  Symbol: ${symbol1}`);
    console.log(`  Decimals: ${decimals1}\n`);

    // Calculate current price
    const Q96 = 2n ** 96n;
    const sqrtPriceX96BigInt = BigInt(slot0.sqrtPriceX96.toString());
    const sqrtPriceSquared = sqrtPriceX96BigInt * sqrtPriceX96BigInt;
    const Q192 = Q96 * Q96;

    // price = (sqrtPriceX96 / 2^96)^2 = token1/token0
    const price = Number(sqrtPriceSquared) / Number(Q192);

    // Human-readable price considering decimals
    const decimals0Num = Number(decimals0);
    const decimals1Num = Number(decimals1);
    const priceAdjusted = price * Math.pow(10, decimals0Num) / Math.pow(10, decimals1Num);
    const token1PerToken0 = priceAdjusted; // How many token1 for 1 token0
    const token0PerToken1 = 1 / priceAdjusted; // How many token0 for 1 token1

    console.log("💰 Current Price:");
    console.log(`  1 ${symbol0} = ${token1PerToken0.toFixed(6)} ${symbol1}`);
    console.log(`  1 ${symbol1} = ${token0PerToken1.toFixed(6)} ${symbol0}\n`);

    // Get pool balances
    const balance0 = await token0.balanceOf(POOL_ADDRESS);
    const balance1 = await token1.balanceOf(POOL_ADDRESS);

    console.log("💵 Pool Reserves:");
    console.log(`  ${symbol0}: ${hre.ethers.formatUnits(balance0, decimals0)}`);
    console.log(`  ${symbol1}: ${hre.ethers.formatUnits(balance1, decimals1)}\n`);

    console.log("🔗 Links:");
    console.log(`  BaseScan: https://sepolia.basescan.org/address/${POOL_ADDRESS}`);
    console.log(`  Uniswap Info: https://info.uniswap.org/#/base/pools/${POOL_ADDRESS}\n`);

    console.log("✅ Pool is live and ready for trading!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

