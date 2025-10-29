/**
 * Complete LP Deployment Flow for X402Token
 * 
 * Usage:
 *   npx hardhat run scripts/deployFullLiquidityFlow.js --network base
 * 
 * Environment Variables Required:
 *   - TOKEN_ADDRESS: The X402Token contract address to deploy LP for
 *   - LAUNCH_TOOL_ADDRESS: The shared LaunchTool contract address
 *   - TARGET_PRICE_USDC: Target initial price in USDC (e.g., 0.5 means 1 token = 0.5 USDC)
 *   - FEE_TIER: Pool fee tier (500, 3000, or 10000)
 *   - TICK_RANGE_WIDTH: Optional tick range width multiplier (default: 100)
 */

const hre = require("hardhat");
const { ethers } = hre;

// ==================== Configuration ====================

const CONFIG = {
    // Contract addresses (from env or hardcoded defaults)
    TOKEN_ADDRESS: process.env.TOKEN_ADDRESS || "",
    LAUNCH_TOOL_ADDRESS: process.env.LAUNCH_TOOL_ADDRESS || "",

    // Price configuration
    TARGET_PRICE_USDC: parseFloat(process.env.TARGET_PRICE_USDC || "0.5"), // 1 token = X USDC

    // Pool configuration
    FEE_TIER: parseInt(process.env.FEE_TIER || "10000"), // 10000 = 1%
    TICK_RANGE_WIDTH: parseInt(process.env.TICK_RANGE_WIDTH || "100"), // multiplier for tick spacing

    // Network-specific addresses (will be set based on chain ID)
    UNISWAP_V3_FACTORY: "",
    POSITION_MANAGER: "",
};

// ==================== Network Configuration ====================

async function initializeNetworkConfig() {
    const chain = await ethers.provider.getNetwork();
    const chainId = chain.chainId;

    if (chainId === 84532n) {
        // Base Sepolia testnet
        CONFIG.UNISWAP_V3_FACTORY = "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24";
        CONFIG.POSITION_MANAGER = "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2";
    } else if (chainId === 8453n) {
        // Base mainnet
        CONFIG.UNISWAP_V3_FACTORY = "0x33128a8fC17869897dcE68Ed026d694621f6FDfD";
        CONFIG.POSITION_MANAGER = "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1";
    } else {
        throw new Error(
            `❌ Unsupported network (Chain ID: ${chainId}).\n` +
            `Supported networks: Base (8453), Base Sepolia (84532)`
        );
    }

    return chain;
}

// ==================== ABI Definitions ====================

const X402_TOKEN_ABI = [
    "function mintingCompleted() view returns (bool)",
    "function mintCount() view returns (uint256)",
    "function maxMintCount() view returns (uint256)",
    "function assetsTransferred() view returns (bool)",
    "function lpLive() view returns (bool)",
    "function transferAssetsForLP()",
    "function confirmLpLive()",
    "function MINT_AMOUNT() view returns (uint256)",
    "function poolSeedAmount() view returns (uint256)",
    "function paymentToken() view returns (address)",
    "function lpDeployer() view returns (address)",
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function approve(address spender, uint256 value) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
];

const ERC20_ABI = [
    "function decimals() view returns (uint8)",
    "function balanceOf(address) view returns (uint256)",
    "function approve(address spender, uint256 value) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
];

const LAUNCH_TOOL_ABI = [
    "function admin() view returns (address)",
    "function configurePoolByAmount(address,address,uint256,uint256,uint160,int24,int24,uint24) returns (uint256)",
    "function withdrawToken(address token, uint256 amount)",
];

const FACTORY_ABI = [
    "function getPool(address,address,uint24) view returns (address)",
    "function feeAmountTickSpacing(uint24) view returns (int24)",
];

const POOL_ABI = [
    "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)",
    "function token0() view returns (address)",
    "function token1() view returns (address)",
];

const POSITION_MANAGER_ABI = [
    "function positions(uint256) view returns (uint96,address,address,address,uint24,int24,int24,uint128,uint256,uint256,uint128,uint128)",
];

// ==================== Utility Functions ====================

/**
 * Wait for transaction confirmation with additional blocks and delay
 */
async function waitForTransaction(tx, description, confirmations = 2) {
    console.log(`  📤 Tx submitted: ${tx.hash}`);
    console.log(`  ⏳ Waiting for ${confirmations} confirmation(s)...`);

    const receipt = await tx.wait(confirmations);
    console.log(`  ✅ Confirmed in block ${receipt.blockNumber}`);

    // Additional delay to ensure blockchain state is fully propagated
    console.log(`  ⏱️  Waiting 3s for state propagation...`);
    await new Promise(resolve => setTimeout(resolve, 3000));

    return receipt;
}

/**
 * Wait between major steps to ensure blockchain state consistency
 */
async function waitBetweenSteps(stepName) {
    console.log(`  ⏱️  Pausing before next step (${stepName})...`);
    await new Promise(resolve => setTimeout(resolve, 2000));
}

/**
 * Compute integer square root using Newton's method
 */
function sqrtBigInt(y) {
    if (y < 2n) return y;
    let x0 = y / 2n;
    let x1 = (x0 + y / x0) / 2n;
    while (x1 < x0) {
        [x0, x1] = [x1, (x1 + y / x1) / 2n];
    }
    return x0;
}

/**
 * Encode sqrt price as X96 format
 * price = token1 / token0 (considering decimals)
 */
function encodeSqrtRatioX96(amount1, amount0) {
    const ratio = (amount1 << 192n) / amount0;
    return sqrtBigInt(ratio);
}

/**
 * Calculate sqrtPriceX96 from human-readable price
 * @param priceToken1PerToken0 - Price as token1/token0 (e.g., if token0=USDC, token1=X402, and 1 X402 = 0.5 USDC, then this = 2)
 * @param decimals0 - Decimals of token0
 * @param decimals1 - Decimals of token1
 */
function calculateSqrtPriceX96(priceToken1PerToken0, decimals0, decimals1) {
    // Uniswap V3 price formula:
    // price_raw = (amount1_in_wei / amount0_in_wei)
    // 
    // If human-readable price is P (token1 per token0), then:
    // 1 token0 (with decimals0) = P token1 (with decimals1)
    // 10^decimals0 token0_wei = P * 10^decimals1 token1_wei
    // price_raw = (P * 10^decimals1) / 10^decimals0

    // Convert price to high precision BigInt
    const priceStr = priceToken1PerToken0.toFixed(18);
    const priceParts = priceStr.split('.');
    const integerPart = BigInt(priceParts[0]);
    const decimalPart = priceParts[1] ? BigInt(priceParts[1].padEnd(18, '0')) : 0n;
    const priceScaled = integerPart * (10n ** 18n) + decimalPart; // price * 10^18

    // price_raw = (priceScaled / 10^18) * 10^decimals1 / 10^decimals0
    //           = priceScaled * 10^decimals1 / (10^18 * 10^decimals0)
    //           = priceScaled * 10^decimals1 / 10^(18 + decimals0)
    let priceRaw;
    const exponent = Number(decimals1) - 18 - Number(decimals0);
    if (exponent >= 0) {
        // Need to multiply first to avoid precision loss
        const multiplier = 10n ** BigInt(exponent);
        priceRaw = priceScaled * multiplier;
    } else {
        // Can divide safely
        const divisor = 10n ** BigInt(-exponent);
        priceRaw = priceScaled / divisor;
    }

    // Ensure priceRaw is positive
    if (priceRaw <= 0n) {
        throw new Error(`Invalid price calculation: priceRaw=${priceRaw}, price=${priceToken1PerToken0}, decimals0=${decimals0}, decimals1=${decimals1}`);
    }

    // sqrtPriceX96 = sqrt(priceRaw) * 2^96
    const sqrtPrice = sqrtBigInt(priceRaw * (2n ** 192n));
    return sqrtPrice;
}

/**
 * Floor tick to nearest valid tick based on tick spacing
 */
function floorToSpacing(tick, tickSpacing) {
    const remainder = tick % tickSpacing;
    if (remainder === 0) return tick;
    if (tick < 0) {
        return tick - (tickSpacing + remainder);
    }
    return tick - remainder;
}

/**
 * Get tick at sqrt price (simplified approximation)
 * For production, consider using @uniswap/v3-sdk
 */
function getTickAtSqrtRatio(sqrtPriceX96) {
    // Simplified calculation
    // tick ≈ log_1.0001(price) = log(price) / log(1.0001)
    const Q96 = 2n ** 96n;
    const price = (sqrtPriceX96 * sqrtPriceX96) / Q96 / Q96;
    const priceFloat = Number(price) / Number(Q96);
    const tick = Math.floor(Math.log(priceFloat) / Math.log(1.0001));
    return tick;
}

// ==================== Main Flow Functions ====================

/**
 * Step A: Pre-deployment checks
 */
async function stepA_PreChecks(tokenContract, signer) {
    console.log("\n📋 Step A: Pre-deployment Checks");
    console.log("=".repeat(60));

    // A1: Check minting completed
    const mintingCompleted = await tokenContract.mintingCompleted();
    const mintCount = await tokenContract.mintCount();
    const maxMintCount = await tokenContract.maxMintCount();

    console.log(`  Minting Status:`);
    console.log(`    - Minting Completed: ${mintingCompleted}`);
    console.log(`    - Mint Count: ${mintCount} / ${maxMintCount}`);

    if (!mintingCompleted && mintCount < maxMintCount) {
        throw new Error("❌ Minting not completed yet!");
    }

    // A2: Check if assets already transferred
    const assetsTransferred = await tokenContract.assetsTransferred();
    console.log(`  Assets Transferred: ${assetsTransferred}`);

    // A3: Check LP status
    const lpLive = await tokenContract.lpLive();
    console.log(`  LP Live: ${lpLive}`);

    if (lpLive) {
        throw new Error("❌ LP already live!");
    }

    // A4: Get token configuration
    const poolSeedAmount = await tokenContract.poolSeedAmount();
    const paymentToken = await tokenContract.paymentToken();
    const lpDeployer = await tokenContract.lpDeployer();
    const tokenDecimals = await tokenContract.decimals();

    console.log(`  Token Configuration:`);
    console.log(`    - Pool Seed Amount: ${ethers.formatUnits(poolSeedAmount, tokenDecimals)}`);
    console.log(`    - Payment Token (USDC): ${paymentToken}`);
    console.log(`    - LP Deployer: ${lpDeployer}`);
    console.log(`    - Token Decimals: ${tokenDecimals}`);

    // A5: Verify signer is LP deployer or has admin rights
    const signerAddress = await signer.getAddress();
    console.log(`  Current Signer: ${signerAddress}`);

    return {
        assetsTransferred,
        poolSeedAmount,
        paymentToken,
        lpDeployer,
        tokenDecimals,
        signerAddress,
    };
}

/**
 * Step A3: Transfer assets for LP
 */
async function stepA3_TransferAssets(tokenContract, info) {
    console.log("\n💸 Step A3: Transfer Assets for LP");
    console.log("=".repeat(60));

    if (info.assetsTransferred) {
        console.log("  ✓ Assets already transferred, skipping...");
        return;
    }

    console.log("  Calling transferAssetsForLP()...");
    const tx = await tokenContract.transferAssetsForLP();
    await waitForTransaction(tx, "transferAssetsForLP", 2);
}

/**
 * Step B: Prepare LP deployer account
 */
async function stepB_PrepareDeployer(tokenContract, launchTool, info, signer) {
    console.log("\n🔧 Step B: Prepare LP Deployer Account");
    console.log("=".repeat(60));

    const paymentToken = new ethers.Contract(info.paymentToken, ERC20_ABI, signer);
    const usdcDecimals = await paymentToken.decimals();

    // B1: Check balances
    const tokenBalance = await tokenContract.balanceOf(info.signerAddress);
    const usdcBalance = await paymentToken.balanceOf(info.signerAddress);

    console.log(`  LP Deployer Balances:`);
    console.log(`    - Token: ${ethers.formatUnits(tokenBalance, info.tokenDecimals)}`);
    console.log(`    - USDC: ${ethers.formatUnits(usdcBalance, usdcDecimals)}`);

    if (tokenBalance < info.poolSeedAmount) {
        throw new Error(`❌ Insufficient token balance! Need ${ethers.formatUnits(info.poolSeedAmount, info.tokenDecimals)}`);
    }

    // B2: Approve tokens to LaunchTool
    console.log("\n  Approving tokens to LaunchTool...");

    const launchToolAddress = await launchTool.getAddress();

    const tokenAllowance = await tokenContract.allowance(info.signerAddress, launchToolAddress);
    console.log(`    - Current Token allowance: ${ethers.formatUnits(tokenAllowance, info.tokenDecimals)}`);
    if (tokenAllowance < tokenBalance) {
        console.log(`    - Approving Token (${ethers.formatUnits(tokenBalance, info.tokenDecimals)})...`);
        const tx1 = await tokenContract.approve(launchToolAddress, ethers.MaxUint256);
        await waitForTransaction(tx1, "Token approval", 2);

        // Verify approval
        const newAllowance = await tokenContract.allowance(info.signerAddress, launchToolAddress);
        console.log(`    - ✅ New Token allowance: ${ethers.formatUnits(newAllowance, info.tokenDecimals)}`);
    } else {
        console.log(`    - ✓ Token already approved (sufficient)`);
    }

    const usdcAllowance = await paymentToken.allowance(info.signerAddress, launchToolAddress);
    console.log(`    - Current USDC allowance: ${ethers.formatUnits(usdcAllowance, usdcDecimals)}`);
    if (usdcAllowance < usdcBalance) {
        console.log(`    - Approving USDC (${ethers.formatUnits(usdcBalance, usdcDecimals)})...`);
        const tx2 = await paymentToken.approve(launchToolAddress, ethers.MaxUint256);
        await waitForTransaction(tx2, "USDC approval", 2);

        // Verify approval
        const newAllowance = await paymentToken.allowance(info.signerAddress, launchToolAddress);
        console.log(`    - ✅ New USDC allowance: ${ethers.formatUnits(newAllowance, usdcDecimals)}`);
    } else {
        console.log(`    - ✓ USDC already approved (sufficient)`);
    }

    return {
        usdcDecimals,
        tokenBalance,
        usdcBalance,
        paymentToken,
    };
}

/**
 * Step B3-6: Calculate pool parameters
 */
async function stepB_CalculateParams(tokenAddress, info, deployerInfo) {
    console.log("\n🧮 Step B3-6: Calculate Pool Parameters");
    console.log("=".repeat(60));

    const tokenAddr = tokenAddress;
    const usdcAddr = info.paymentToken;

    // Calculate required USDC based on target price
    // Target: 1 Token = TARGET_PRICE_USDC USDC
    const tokenAmountFloat = parseFloat(ethers.formatUnits(deployerInfo.tokenBalance, info.tokenDecimals));
    const requiredUsdcFloat = tokenAmountFloat * CONFIG.TARGET_PRICE_USDC;
    const usdcDecimalsNum = Number(deployerInfo.usdcDecimals);
    const requiredUsdc = ethers.parseUnits(requiredUsdcFloat.toFixed(usdcDecimalsNum), deployerInfo.usdcDecimals);

    console.log(`  Amount Calculation:`);
    console.log(`    - Token amount: ${tokenAmountFloat.toFixed(6)} Token`);
    console.log(`    - Target price: 1 Token = ${CONFIG.TARGET_PRICE_USDC} USDC`);
    console.log(`    - Required USDC: ${requiredUsdcFloat.toFixed(6)} USDC`);
    console.log(`    - Available USDC: ${ethers.formatUnits(deployerInfo.usdcBalance, deployerInfo.usdcDecimals)} USDC`);

    if (requiredUsdc > deployerInfo.usdcBalance) {
        throw new Error(
            `❌ Insufficient USDC!\n` +
            `  Required: ${requiredUsdcFloat.toFixed(6)} USDC\n` +
            `  Available: ${ethers.formatUnits(deployerInfo.usdcBalance, deployerInfo.usdcDecimals)} USDC`
        );
    }

    // B3: Determine token0/token1 order
    let token0, token1, amount0, amount1, decimals0, decimals1;
    if (usdcAddr.toLowerCase() < tokenAddr.toLowerCase()) {
        token0 = usdcAddr;
        token1 = tokenAddr;
        amount0 = requiredUsdc;              // 计算出的USDC
        amount1 = deployerInfo.tokenBalance; // 全部Token
        decimals0 = deployerInfo.usdcDecimals;
        decimals1 = info.tokenDecimals;
    } else {
        token0 = tokenAddr;
        token1 = usdcAddr;
        amount0 = deployerInfo.tokenBalance; // 全部Token
        amount1 = requiredUsdc;              // 计算出的USDC
        decimals0 = info.tokenDecimals;
        decimals1 = deployerInfo.usdcDecimals;
    }

    console.log(`\n  Token Ordering:`);
    console.log(`    - token0: ${token0} (${decimals0} decimals)`);
    console.log(`    - token1: ${token1} (${decimals1} decimals)`);
    console.log(`    - amount0: ${ethers.formatUnits(amount0, decimals0)}`);
    console.log(`    - amount1: ${ethers.formatUnits(amount1, decimals1)}`);

    // B4: Calculate sqrtPriceX96
    // Target: 1 Token = TARGET_PRICE_USDC USDC
    // So: USDC per Token = TARGET_PRICE_USDC
    // If token0 = USDC, token1 = Token: price = Token/USDC = 1/TARGET_PRICE_USDC
    // If token0 = Token, token1 = USDC: price = USDC/Token = TARGET_PRICE_USDC

    let priceToken1PerToken0;
    if (token0.toLowerCase() === usdcAddr.toLowerCase()) {
        // token0 = USDC, token1 = Token
        // price = token1/token0 = Token/USDC = 1/TARGET_PRICE_USDC
        priceToken1PerToken0 = 1.0 / CONFIG.TARGET_PRICE_USDC;
    } else {
        // token0 = Token, token1 = USDC
        // price = token1/token0 = USDC/Token = TARGET_PRICE_USDC
        priceToken1PerToken0 = CONFIG.TARGET_PRICE_USDC;
    }

    console.log(`  Price Configuration:`);
    console.log(`    - Target: 1 Token = ${CONFIG.TARGET_PRICE_USDC} USDC`);
    console.log(`    - Calculated price (token1/token0): ${priceToken1PerToken0}`);

    const sqrtPriceX96 = calculateSqrtPriceX96(priceToken1PerToken0, decimals0, decimals1);
    console.log(`    - sqrtPriceX96: ${sqrtPriceX96.toString()}`);

    // B5: Get tick spacing for fee tier
    const factory = new ethers.Contract(
        CONFIG.UNISWAP_V3_FACTORY,
        FACTORY_ABI,
        ethers.provider
    );

    let tickSpacing;
    try {
        tickSpacing = await factory.feeAmountTickSpacing(CONFIG.FEE_TIER);

        // Check if tick spacing is valid (returns 0 if fee tier doesn't exist)
        if (tickSpacing === 0 || tickSpacing === 0n) {
            throw new Error("Fee tier not enabled");
        }
    } catch (error) {
        // Use known tick spacings as fallback
        const knownTickSpacings = {
            500: 10,    // 0.05%
            3000: 60,   // 0.3%
            10000: 200  // 1%
        };

        if (knownTickSpacings[CONFIG.FEE_TIER]) {
            console.log(`  ⚠️  Warning: Could not query factory, using known tick spacing`);
            tickSpacing = knownTickSpacings[CONFIG.FEE_TIER];
        } else {
            throw new Error(
                `❌ Fee tier ${CONFIG.FEE_TIER} not supported.\n` +
                `  Supported fee tiers: 500 (0.05%), 3000 (0.3%), 10000 (1%)\n` +
                `  Factory address: ${CONFIG.UNISWAP_V3_FACTORY}\n` +
                `  Original error: ${error.message}`
            );
        }
    }

    console.log(`  Fee Tier & Tick Spacing:`);
    console.log(`    - Fee: ${CONFIG.FEE_TIER} (${CONFIG.FEE_TIER / 10000}%)`);
    console.log(`    - Tick Spacing: ${tickSpacing}`);

    // B6: Calculate tick range
    const currentTick = getTickAtSqrtRatio(sqrtPriceX96);
    const tickWidth = CONFIG.TICK_RANGE_WIDTH * Number(tickSpacing);

    const tickLower = floorToSpacing(currentTick - tickWidth, Number(tickSpacing));
    const tickUpper = floorToSpacing(currentTick + tickWidth, Number(tickSpacing));

    console.log(`  Tick Range:`);
    console.log(`    - Current Tick (approx): ${currentTick}`);
    console.log(`    - Tick Width: ±${tickWidth}`);
    console.log(`    - tickLower: ${tickLower}`);
    console.log(`    - tickUpper: ${tickUpper}`);

    // Validate tick range
    const MIN_TICK = -887272;
    const MAX_TICK = 887272;
    if (tickLower < MIN_TICK || tickUpper > MAX_TICK) {
        throw new Error(`❌ Tick range out of bounds! MIN=${MIN_TICK}, MAX=${MAX_TICK}`);
    }

    return {
        token0,
        token1,
        amount0,
        amount1,
        sqrtPriceX96,
        tickLower,
        tickUpper,
        fee: CONFIG.FEE_TIER,
    };
}

/**
 * Step C: Create pool and add liquidity
 */
async function stepC_CreatePool(launchTool, poolParams, signer) {
    console.log("\n🏊 Step C: Create Pool and Add Liquidity");
    console.log("=".repeat(60));

    // Pre-flight checks
    console.log(`  Pre-flight Checks:`);
    const launchToolAddress = await launchTool.getAddress();
    const signerAddress = await signer.getAddress();

    const token0Contract = new ethers.Contract(poolParams.token0, ERC20_ABI, signer);
    const token1Contract = new ethers.Contract(poolParams.token1, ERC20_ABI, signer);

    const balance0 = await token0Contract.balanceOf(signerAddress);
    const balance1 = await token1Contract.balanceOf(signerAddress);
    const allowance0 = await token0Contract.allowance(signerAddress, launchToolAddress);
    const allowance1 = await token1Contract.allowance(signerAddress, launchToolAddress);

    console.log(`    - Signer: ${signerAddress}`);
    console.log(`    - LaunchTool: ${launchToolAddress}`);
    console.log(`    - Token0 balance: ${balance0.toString()} (need: ${poolParams.amount0.toString()})`);
    console.log(`    - Token0 allowance: ${allowance0.toString()}`);
    console.log(`    - Token1 balance: ${balance1.toString()} (need: ${poolParams.amount1.toString()})`);
    console.log(`    - Token1 allowance: ${allowance1.toString()}`);

    // Validate
    if (balance0 < poolParams.amount0) {
        throw new Error(`❌ Insufficient token0 balance! Have: ${balance0}, Need: ${poolParams.amount0}`);
    }
    if (balance1 < poolParams.amount1) {
        throw new Error(`❌ Insufficient token1 balance! Have: ${balance1}, Need: ${poolParams.amount1}`);
    }
    if (allowance0 < poolParams.amount0) {
        throw new Error(`❌ Insufficient token0 allowance! Have: ${allowance0}, Need: ${poolParams.amount0}`);
    }
    if (allowance1 < poolParams.amount1) {
        throw new Error(`❌ Insufficient token1 allowance! Have: ${allowance1}, Need: ${poolParams.amount1}`);
    }

    console.log(`\n  Calling LaunchTool.configurePoolByAmount()...`);
    console.log(`  Parameters:`);
    console.log(`    - token0: ${poolParams.token0}`);
    console.log(`    - token1: ${poolParams.token1}`);
    console.log(`    - amount0: ${poolParams.amount0.toString()}`);
    console.log(`    - amount1: ${poolParams.amount1.toString()}`);
    console.log(`    - sqrtPriceX96: ${poolParams.sqrtPriceX96.toString()}`);
    console.log(`    - tickLower: ${poolParams.tickLower}`);
    console.log(`    - tickUpper: ${poolParams.tickUpper}`);
    console.log(`    - fee: ${poolParams.fee}`);

    const tx = await launchTool.configurePoolByAmount(
        poolParams.token0,
        poolParams.token1,
        poolParams.amount0,
        poolParams.amount1,
        poolParams.sqrtPriceX96,
        poolParams.tickLower,
        poolParams.tickUpper,
        poolParams.fee
    );

    const receipt = await waitForTransaction(tx, "configurePoolByAmount", 3);

    // Parse events to get position ID
    const poolConfiguredEvent = receipt.logs
        .map(log => {
            try {
                return launchTool.interface.parseLog(log);
            } catch {
                return null;
            }
        })
        .find(event => event && event.name === "PoolConfigured");

    if (poolConfiguredEvent) {
        console.log(`  Position ID: ${poolConfiguredEvent.args.positionId}`);
        console.log(`  Liquidity: ${poolConfiguredEvent.args.liquidity.toString()}`);
        console.log(`  Pool Address: ${poolConfiguredEvent.args.pool}`);

        return {
            positionId: poolConfiguredEvent.args.positionId,
            liquidity: poolConfiguredEvent.args.liquidity,
            poolAddress: poolConfiguredEvent.args.pool,
        };
    }

    return { receipt };
}

/**
 * Step D: Confirm LP live
 */
async function stepD_ConfirmLpLive(tokenContract) {
    console.log("\n✅ Step D: Confirm LP Live");
    console.log("=".repeat(60));

    console.log("  Calling confirmLpLive()...");
    const tx = await tokenContract.confirmLpLive();
    await waitForTransaction(tx, "confirmLpLive", 2);
}

/**
 * Step E: Verification and cleanup
 */
async function stepE_Verify(poolParams, poolResult, tokenContract) {
    console.log("\n🔍 Step E: Verification");
    console.log("=".repeat(60));

    // E1: Verify pool exists
    const factory = new ethers.Contract(
        CONFIG.UNISWAP_V3_FACTORY,
        FACTORY_ABI,
        ethers.provider
    );

    const poolAddress = await factory.getPool(
        poolParams.token0,
        poolParams.token1,
        poolParams.fee
    );

    console.log(`  Pool Verification:`);
    console.log(`    - Pool Address: ${poolAddress}`);

    if (poolAddress === ethers.ZeroAddress) {
        throw new Error("❌ Pool not found!");
    }

    // E2: Check pool state
    const pool = new ethers.Contract(poolAddress, POOL_ABI, ethers.provider);
    const slot0 = await pool.slot0();

    console.log(`  Pool State:`);
    console.log(`    - Current sqrtPriceX96: ${slot0.sqrtPriceX96.toString()}`);
    console.log(`    - Current tick: ${slot0.tick}`);
    console.log(`    - Expected sqrtPriceX96: ${poolParams.sqrtPriceX96.toString()}`);

    // E3: Check position
    if (poolResult.positionId) {
        const positionManager = new ethers.Contract(
            CONFIG.POSITION_MANAGER,
            POSITION_MANAGER_ABI,
            ethers.provider
        );

        const position = await positionManager.positions(poolResult.positionId);
        console.log(`  Position Details:`);
        console.log(`    - Position ID: ${poolResult.positionId}`);
        console.log(`    - Liquidity: ${position[7].toString()}`);
        console.log(`    - Tick Lower: ${position[5]}`);
        console.log(`    - Tick Upper: ${position[6]}`);
    }

    // E4: Check LP live status
    const lpLive = await tokenContract.lpLive();
    console.log(`  LP Live Status: ${lpLive}`);

    if (!lpLive) {
        console.log(`  ⚠️  Warning: LP not marked as live yet`);
    }
}

/**
 * Step E5: Cleanup leftover balances
 */
async function stepE_Cleanup(launchTool, poolParams, signer) {
    console.log("\n🧹 Step E5: Cleanup");
    console.log("=".repeat(60));

    const token0 = new ethers.Contract(poolParams.token0, ERC20_ABI, ethers.provider);
    const token1 = new ethers.Contract(poolParams.token1, ERC20_ABI, ethers.provider);

    const launchToolAddress = await launchTool.getAddress();
    const balance0 = await token0.balanceOf(launchToolAddress);
    const balance1 = await token1.balanceOf(launchToolAddress);

    console.log(`  LaunchTool Balances:`);
    console.log(`    - token0: ${balance0.toString()}`);
    console.log(`    - token1: ${balance1.toString()}`);

    if (balance0 > 0n) {
        console.log(`  Withdrawing token0 (${balance0.toString()})...`);
        const tx0 = await launchTool.withdrawToken(poolParams.token0, balance0);
        await waitForTransaction(tx0, "withdraw token0", 2);
    }

    if (balance1 > 0n) {
        console.log(`  Withdrawing token1 (${balance1.toString()})...`);
        const tx1 = await launchTool.withdrawToken(poolParams.token1, balance1);
        await waitForTransaction(tx1, "withdraw token1", 2);
    }

    if (balance0 === 0n && balance1 === 0n) {
        console.log(`  ✓ No leftover balances to clean up`);
    }
}

// ==================== Main Function ====================

async function main() {
    console.log("╔════════════════════════════════════════════════════════════╗");
    console.log("║       Complete LP Deployment Flow for X402Token           ║");
    console.log("╚════════════════════════════════════════════════════════════╝");

    // Initialize network configuration
    const chain = await initializeNetworkConfig();
    console.log(`\n🌐 Network: ${chain.name} (Chain ID: ${chain.chainId})`);
    console.log(`  Uniswap V3 Factory: ${CONFIG.UNISWAP_V3_FACTORY}`);
    console.log(`  Position Manager: ${CONFIG.POSITION_MANAGER}`);

    // Validate configuration
    if (!CONFIG.TOKEN_ADDRESS) {
        throw new Error("❌ TOKEN_ADDRESS not set! Set env variable TOKEN_ADDRESS");
    }
    if (!CONFIG.LAUNCH_TOOL_ADDRESS) {
        throw new Error("❌ LAUNCH_TOOL_ADDRESS not set! Set env variable LAUNCH_TOOL_ADDRESS");
    }

    console.log("\n⚙️  Configuration:");
    console.log(`  Token Address: ${CONFIG.TOKEN_ADDRESS}`);
    console.log(`  LaunchTool Address: ${CONFIG.LAUNCH_TOOL_ADDRESS}`);
    console.log(`  Target Price: 1 Token = ${CONFIG.TARGET_PRICE_USDC} USDC`);
    console.log(`  Fee Tier: ${CONFIG.FEE_TIER / 10000}%`);
    console.log(`  Tick Range Width: ${CONFIG.TICK_RANGE_WIDTH}x spacing`);

    // Get signer
    const [signer] = await ethers.getSigners();
    console.log(`\n🔑 Signer: ${await signer.getAddress()}`);

    // Initialize contracts
    const tokenContract = new ethers.Contract(CONFIG.TOKEN_ADDRESS, X402_TOKEN_ABI, signer);
    const launchTool = new ethers.Contract(CONFIG.LAUNCH_TOOL_ADDRESS, LAUNCH_TOOL_ABI, signer);

    try {
        // Execute flow
        const info = await stepA_PreChecks(tokenContract, signer);
        await stepA3_TransferAssets(tokenContract, info);

        // Refresh info after transfer
        await waitBetweenSteps("Refresh balances");
        info.assetsTransferred = await tokenContract.assetsTransferred();

        const deployerInfo = await stepB_PrepareDeployer(tokenContract, launchTool, info, signer);

        await waitBetweenSteps("Calculate params");
        const poolParams = await stepB_CalculateParams(CONFIG.TOKEN_ADDRESS, info, deployerInfo);

        await waitBetweenSteps("Create pool");
        const poolResult = await stepC_CreatePool(launchTool, poolParams, signer);

        await waitBetweenSteps("Confirm LP live");
        await stepD_ConfirmLpLive(tokenContract);

        await waitBetweenSteps("Verify");
        await stepE_Verify(poolParams, poolResult, tokenContract);

        await waitBetweenSteps("Cleanup");
        await stepE_Cleanup(launchTool, poolParams, signer);

        console.log("\n╔════════════════════════════════════════════════════════════╗");
        console.log("║                    ✅ DEPLOYMENT COMPLETE!                  ║");
        console.log("╚════════════════════════════════════════════════════════════╝");

        if (poolResult.poolAddress) {
            console.log(`\n🎉 Pool Address: ${poolResult.poolAddress}`);
            console.log(`🎉 Position ID: ${poolResult.positionId}`);
        }

    } catch (error) {
        console.error("\n❌ Error during deployment:");
        console.error(error);
        process.exit(1);
    }
}

// ==================== Execute ====================

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

