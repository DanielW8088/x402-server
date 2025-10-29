/**
 * Check Token and LP Status
 * 
 * Quick diagnostic script to check the current state of a token and its LP
 * 
 * Usage:
 *   TOKEN_ADDRESS=0x... npx hardhat run scripts/checkTokenLpStatus.js --network base
 */

const hre = require("hardhat");
const { ethers } = hre;

const TOKEN_ADDRESS = process.env.TOKEN_ADDRESS || "";
const LAUNCH_TOOL_ADDRESS = process.env.LAUNCH_TOOL_ADDRESS || "";

const X402_TOKEN_ABI = [
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function totalSupply() view returns (uint256)",
    "function mintingCompleted() view returns (bool)",
    "function mintCount() view returns (uint256)",
    "function maxMintCount() view returns (uint256)",
    "function assetsTransferred() view returns (bool)",
    "function lpLive() view returns (bool)",
    "function MINT_AMOUNT() view returns (uint256)",
    "function poolSeedAmount() view returns (uint256)",
    "function paymentToken() view returns (address)",
    "function lpDeployer() view returns (address)",
    "function balanceOf(address) view returns (uint256)",
    "function getUSDCBalance() view returns (uint256)",
];

const ERC20_ABI = [
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
];

const FACTORY_ABI = [
    "function getPool(address,address,uint24) view returns (address)",
];

const POOL_ABI = [
    "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)",
    "function liquidity() view returns (uint128)",
];

const LAUNCH_TOOL_ABI = [
    "function admin() view returns (address)",
];

const UNISWAP_V3_FACTORY = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";

function formatWithDecimals(value, decimals) {
    return ethers.formatUnits(value, decimals);
}

function calculatePrice(sqrtPriceX96, decimals0, decimals1, token0IsUsdc) {
    const Q96 = 2n ** 96n;
    const price = (sqrtPriceX96 * sqrtPriceX96 * (10n ** BigInt(decimals0))) / (Q96 * Q96 * (10n ** BigInt(decimals1)));

    if (token0IsUsdc) {
        // price = Token/USDC, so 1 Token = 1/price USDC
        return Number(10n ** 18n / price) / 1e18;
    } else {
        // price = USDC/Token, so 1 Token = price USDC
        return Number(price) / 1e18;
    }
}

async function main() {
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║              Token & LP Status Checker                    ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");

    if (!TOKEN_ADDRESS) {
        console.error("❌ TOKEN_ADDRESS not set!");
        console.log("\nUsage:");
        console.log("  TOKEN_ADDRESS=0x... npx hardhat run scripts/checkTokenLpStatus.js --network base");
        process.exit(1);
    }

    console.log(`Token Address: ${TOKEN_ADDRESS}`);
    if (LAUNCH_TOOL_ADDRESS) {
        console.log(`LaunchTool Address: ${LAUNCH_TOOL_ADDRESS}`);
    }
    console.log();

    try {
        const token = new ethers.Contract(TOKEN_ADDRESS, X402_TOKEN_ABI, ethers.provider);

        // ==================== Basic Info ====================
        console.log("📋 BASIC INFO");
        console.log("─".repeat(60));

        const name = await token.name();
        const symbol = await token.symbol();
        const decimals = await token.decimals();
        const totalSupply = await token.totalSupply();

        console.log(`  Name: ${name}`);
        console.log(`  Symbol: ${symbol}`);
        console.log(`  Decimals: ${decimals}`);
        console.log(`  Total Supply: ${formatWithDecimals(totalSupply, decimals)}`);

        // ==================== Minting Status ====================
        console.log("\n🪙 MINTING STATUS");
        console.log("─".repeat(60));

        const mintingCompleted = await token.mintingCompleted();
        const mintCount = await token.mintCount();
        const maxMintCount = await token.maxMintCount();
        const mintAmount = await token.MINT_AMOUNT();

        console.log(`  Minting Completed: ${mintingCompleted ? "✅ YES" : "❌ NO"}`);
        console.log(`  Mint Count: ${mintCount} / ${maxMintCount}`);
        console.log(`  Mint Amount: ${formatWithDecimals(mintAmount, decimals)} per mint`);
        console.log(`  Remaining Mints: ${maxMintCount - mintCount}`);

        const progress = maxMintCount > 0 ? (Number(mintCount) / Number(maxMintCount) * 100).toFixed(2) : 0;
        console.log(`  Progress: ${progress}%`);

        // ==================== LP Configuration ====================
        console.log("\n🏊 LP CONFIGURATION");
        console.log("─".repeat(60));

        const poolSeedAmount = await token.poolSeedAmount();
        const paymentToken = await token.paymentToken();
        const lpDeployer = await token.lpDeployer();
        const assetsTransferred = await token.assetsTransferred();
        const lpLive = await token.lpLive();

        console.log(`  Pool Seed Amount: ${formatWithDecimals(poolSeedAmount, decimals)}`);
        console.log(`  Payment Token (USDC): ${paymentToken}`);
        console.log(`  LP Deployer: ${lpDeployer}`);
        console.log(`  Assets Transferred: ${assetsTransferred ? "✅ YES" : "❌ NO"}`);
        console.log(`  LP Live: ${lpLive ? "✅ YES" : "❌ NO"}`);

        // ==================== Balances ====================
        console.log("\n💰 BALANCES");
        console.log("─".repeat(60));

        const tokenBalance = await token.balanceOf(TOKEN_ADDRESS);
        console.log(`  Token balance in contract: ${formatWithDecimals(tokenBalance, decimals)}`);

        try {
            const usdcBalance = await token.getUSDCBalance();
            const usdc = new ethers.Contract(paymentToken, ERC20_ABI, ethers.provider);
            const usdcDecimals = await usdc.decimals();
            console.log(`  USDC balance in contract: ${formatWithDecimals(usdcBalance, usdcDecimals)}`);
        } catch (e) {
            console.log(`  USDC balance: Error reading (${e.message.substring(0, 50)}...)`);
        }

        if (assetsTransferred && lpDeployer !== ethers.ZeroAddress) {
            console.log(`\n  LP Deployer balances:`);
            const lpTokenBalance = await token.balanceOf(lpDeployer);
            console.log(`    - Token: ${formatWithDecimals(lpTokenBalance, decimals)}`);

            try {
                const usdc = new ethers.Contract(paymentToken, ERC20_ABI, ethers.provider);
                const usdcDecimals = await usdc.decimals();
                const lpUsdcBalance = await usdc.balanceOf(lpDeployer);
                console.log(`    - USDC: ${formatWithDecimals(lpUsdcBalance, usdcDecimals)}`);
            } catch (e) {
                console.log(`    - USDC: Error reading`);
            }
        }

        // ==================== Pool Status ====================
        console.log("\n🔍 POOL STATUS");
        console.log("─".repeat(60));

        const factory = new ethers.Contract(UNISWAP_V3_FACTORY, FACTORY_ABI, ethers.provider);

        // Check common fee tiers
        const feeTiers = [500, 3000, 10000];
        const usdc = new ethers.Contract(paymentToken, ERC20_ABI, ethers.provider);
        const usdcDecimals = await usdc.decimals();
        const usdcSymbol = await usdc.symbol();

        let poolFound = false;

        for (const fee of feeTiers) {
            const poolAddress = await factory.getPool(TOKEN_ADDRESS, paymentToken, fee);

            if (poolAddress !== ethers.ZeroAddress) {
                poolFound = true;
                console.log(`\n  Pool found at fee tier ${fee / 10000}%:`);
                console.log(`  Address: ${poolAddress}`);

                try {
                    const pool = new ethers.Contract(poolAddress, POOL_ABI, ethers.provider);
                    const slot0 = await pool.slot0();
                    const liquidity = await pool.liquidity();

                    // Determine token order
                    const token0IsUsdc = TOKEN_ADDRESS.toLowerCase() > paymentToken.toLowerCase();

                    // Calculate human-readable price
                    const priceInUsdc = calculatePrice(
                        slot0.sqrtPriceX96,
                        token0IsUsdc ? usdcDecimals : decimals,
                        token0IsUsdc ? decimals : usdcDecimals,
                        token0IsUsdc
                    );

                    console.log(`  Current Price: 1 ${symbol} = ${priceInUsdc.toFixed(6)} ${usdcSymbol}`);
                    console.log(`  Current Tick: ${slot0.tick}`);
                    console.log(`  Liquidity: ${liquidity.toString()}`);
                    console.log(`  sqrtPriceX96: ${slot0.sqrtPriceX96.toString()}`);
                } catch (e) {
                    console.log(`  ⚠️  Pool exists but error reading state: ${e.message.substring(0, 50)}...`);
                }
            }
        }

        if (!poolFound) {
            console.log("  ❌ No pool found for this token");
            console.log("  Checked fee tiers: 0.05%, 0.3%, 1%");
        }

        // ==================== LaunchTool Status ====================
        if (LAUNCH_TOOL_ADDRESS) {
            console.log("\n🔧 LAUNCHTOOL STATUS");
            console.log("─".repeat(60));

            const launchTool = new ethers.Contract(LAUNCH_TOOL_ADDRESS, LAUNCH_TOOL_ABI, ethers.provider);
            const admin = await launchTool.admin();
            console.log(`  Admin: ${admin}`);
            console.log(`  Admin matches LP Deployer: ${admin.toLowerCase() === lpDeployer.toLowerCase() ? "✅ YES" : "❌ NO"}`);
        }

        // ==================== Deployment Status ====================
        console.log("\n📊 DEPLOYMENT STATUS");
        console.log("─".repeat(60));

        const statusChecks = [
            { name: "Minting Completed", status: mintingCompleted },
            { name: "Assets Transferred", status: assetsTransferred },
            { name: "Pool Created", status: poolFound },
            { name: "LP Live", status: lpLive },
        ];

        statusChecks.forEach(check => {
            const icon = check.status ? "✅" : "❌";
            console.log(`  ${icon} ${check.name}`);
        });

        const allComplete = statusChecks.every(c => c.status);

        console.log("\n" + "=".repeat(60));
        if (allComplete) {
            console.log("🎉 LP DEPLOYMENT COMPLETE!");
        } else {
            console.log("⏳ Next steps:");
            if (!mintingCompleted) {
                console.log("  1. Complete minting");
            }
            if (!assetsTransferred && mintingCompleted) {
                console.log("  2. Call transferAssetsForLP()");
            }
            if (!poolFound && assetsTransferred) {
                console.log("  3. Deploy LP using deployFullLiquidityFlow.js");
            }
            if (!lpLive && poolFound) {
                console.log("  4. Call confirmLpLive()");
            }
        }
        console.log("=".repeat(60));

    } catch (error) {
        console.error("\n❌ Error:");
        console.error(error.message);

        if (error.message.includes("invalid address")) {
            console.log("\n💡 Tip: Make sure TOKEN_ADDRESS is a valid contract address");
        }

        process.exit(1);
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });

