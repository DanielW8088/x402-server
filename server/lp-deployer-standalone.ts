#!/usr/bin/env node
/**
 * Standalone LP Deployer Service v2.0
 * 
 * Monitors database for tokens ready for LP deployment and deploys them using LaunchTool
 * 
 * Key Features:
 * - Automatic setLaunchTool whitelist configuration
 * - One-command LP deployment flow
 * - Token decimals: 6 (aligned with USDC)
 * - Initial LP ratio: 1 USDC = MINT_AMOUNT tokens
 * 
 * Requirements:
 * - LaunchTool must be deployed on the target network
 * - LAUNCH_TOOL_ADDRESS must be set in environment variables
 * - LP_DEPLOYER wallet must have sufficient USDC
 * 
 * Run independently from the main server
 */

import { Pool } from "pg";
import { createPublicClient, createWalletClient, http, parseAbi, encodeFunctionData, formatUnits, parseUnits } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";
import * as dotenv from "dotenv";
import { resolve } from "path";

// Load environment variables from .env file (explicitly from current directory)
dotenv.config({ path: resolve(process.cwd(), '.env') });

// ==================== Constants ====================

const TOKEN_DECIMALS = 6; // X402Token uses 6 decimals (same as USDC)
const USDC_DECIMALS = 6;

const FEE_TIER = 10000; // 1% fee
const TICK_SPACING = 200; // For 1% fee tier
const TICK_RANGE_WIDTH = 100; // Multiplier for tick spacing

const MIN_TICK = -887272;
const MAX_TICK = 887272;

// ==================== ABIs ====================

const tokenAbi = parseAbi([
  "function mintCount() view returns (uint256)",
  "function maxMintCount() view returns (uint256)",
  "function mintingCompleted() view returns (bool)",
  "function assetsTransferred() view returns (bool)",
  "function lpLive() view returns (bool)",
  "function transferAssetsForLP() external",
  "function confirmLpLive() external",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function paymentToken() view returns (address)",
  "function MINT_AMOUNT() view returns (uint256)",
  "function poolSeedAmount() view returns (uint256)",
  // LaunchTool whitelist
  "function launchTool() view returns (address)",
  "function setLaunchTool(address) external",
  "function owner() view returns (address)",
]);

const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

const launchToolAbi = parseAbi([
  "function admin() view returns (address)",
  "function configurePoolByAmount(address token0, address token1, uint256 amount0, uint256 amount1, uint160 sqrtPriceX96, int24 tickLower, int24 tickUpper, uint24 fee) external returns (uint256 positionId)",
  "function withdrawToken(address token, uint256 amount) external",
]);

const factoryAbi = parseAbi([
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)",
]);

const poolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);

// ==================== Helper Functions ====================

/**
 * Sleep/delay utility to avoid rate limiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Compute integer square root using Newton's method
 */
function sqrtBigInt(y: bigint): bigint {
  if (y < 2n) return y;
  let x0 = y / 2n;
  let x1 = (x0 + y / x0) / 2n;
  while (x1 < x0) {
    [x0, x1] = [x1, (x1 + y / x1) / 2n];
  }
  return x0;
}

/**
 * Calculate sqrtPriceX96 from human-readable price
 * @param priceToken1PerToken0 - Price as token1/token0
 * @param decimals0 - Decimals of token0
 * @param decimals1 - Decimals of token1
 */
function calculateSqrtPriceX96(
  priceToken1PerToken0: number,
  decimals0: number,
  decimals1: number
): bigint {
  // Convert price to high precision BigInt
  const priceStr = priceToken1PerToken0.toFixed(18);
  const priceParts = priceStr.split('.');
  const integerPart = BigInt(priceParts[0]);
  const decimalPart = priceParts[1] ? BigInt(priceParts[1].padEnd(18, '0')) : 0n;
  const priceScaled = integerPart * (10n ** 18n) + decimalPart;

  let priceRaw: bigint;
  const exponent = decimals1 - 18 - decimals0;
  if (exponent >= 0) {
    const multiplier = 10n ** BigInt(exponent);
    priceRaw = priceScaled * multiplier;
  } else {
    const divisor = 10n ** BigInt(-exponent);
    priceRaw = priceScaled / divisor;
  }

  if (priceRaw <= 0n) {
    throw new Error(`Invalid price calculation: priceRaw=${priceRaw}`);
  }

  const sqrtPrice = sqrtBigInt(priceRaw * (2n ** 192n));
  return sqrtPrice;
}

/**
 * Get tick at sqrt price
 */
function getTickAtSqrtRatio(sqrtPriceX96: bigint): number {
  const Q96 = 2n ** 96n;
  const sqrtPriceSquared = sqrtPriceX96 * sqrtPriceX96;
  const Q192 = Q96 * Q96;
  
  const priceFloat = Number(sqrtPriceSquared) / Number(Q192);
  const tick = Math.floor(Math.log(priceFloat) / Math.log(1.0001));
  
  return tick;
}

/**
 * Floor tick to nearest valid tick based on tick spacing
 */
function floorToSpacing(tick: number, tickSpacing: number): number {
  const remainder = tick % tickSpacing;
  if (remainder === 0) return tick;
  if (tick < 0) {
    return tick - (tickSpacing + remainder);
  }
  return tick - remainder;
}

/**
 * Wait for transaction confirmation
 */
async function waitForTransaction(
  publicClient: any,
  hash: `0x${string}`,
  description: string,
  confirmations: number = 2
): Promise<any> {
  console.log(`  📤 Tx: ${hash}`);
  console.log(`  ⏳ Waiting for ${confirmations} confirmation(s)...`);
  
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations,
  });
  
  console.log(`  ✅ Confirmed in block ${receipt.blockNumber}`);
  
  // Additional delay for state propagation
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  return receipt;
}

// ==================== Main Class ====================

class StandaloneLPDeployer {
  private pool: Pool;
  private walletClient: any;  // Single wallet for all operations
  private publicClient: any;
  private launchToolAddress: `0x${string}`;
  private factoryAddress: `0x${string}`;
  private checkInterval: number = 60000; // 60 seconds (1 minute)
  private monitorInterval: NodeJS.Timeout | null = null;
  private processingTokens: Set<string> = new Set();
  private isProcessing: boolean = false;
  private network: string;

  constructor() {
    // Validate environment variables
    const missingVars: string[] = [];
    if (!process.env.DATABASE_URL) missingVars.push("DATABASE_URL");
    if (!process.env.LP_DEPLOYER_PRIVATE_KEY) missingVars.push("LP_DEPLOYER_PRIVATE_KEY");
    if (!process.env.LAUNCH_TOOL_ADDRESS) missingVars.push("LAUNCH_TOOL_ADDRESS");

    if (missingVars.length > 0) {
      console.error("\n❌ Missing required environment variables:");
      missingVars.forEach(v => console.error(`   - ${v}`));
      console.error("\n💡 To fix:");
      console.error("   1. Create .env file: cp env.multi-token.example .env");
      console.error("   2. Set all required variables");
      console.error("\n📖 Required:");
      console.error("   DATABASE_URL=postgresql://...");
      console.error("   LP_DEPLOYER_PRIVATE_KEY=0x...  (token owner, also used for LP deployment)");
      console.error("   LAUNCH_TOOL_ADDRESS=0x...\n");
      throw new Error("Missing required environment variables");
    }

    // Database with SSL support
    const databaseUrl = process.env.DATABASE_URL;
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl?.includes('sslmode=require') ? {
        rejectUnauthorized: false
      } : false,
    });

    // Network config
    this.network = process.env.NETWORK || "baseSepolia";
    const chain = this.network === "base" ? base : baseSepolia;
    const rpcUrl = this.network === "base"
      ? (process.env.BASE_RPC_URL || "https://mainnet.base.org")
      : (process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org");

    // LaunchTool address from env
    this.launchToolAddress = process.env.LAUNCH_TOOL_ADDRESS as `0x${string}`;
    
    // Factory address
    this.factoryAddress = (this.network === "base"
      ? "0x33128a8fC17869897dcE68Ed026d694621f6FDfD"
      : "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24") as `0x${string}`;

    // Clients with retry and rate limiting
    this.publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl, {
        timeout: 30000, // 30 seconds timeout
        retryCount: 3,
        retryDelay: 1000, // 1 second between retries
      }),
    });

    // Single wallet for all operations (token owner + LP deployer)
    const account = privateKeyToAccount(process.env.LP_DEPLOYER_PRIVATE_KEY as `0x${string}`);
    this.walletClient = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl, {
        timeout: 60000, // 60 seconds for transactions
        retryCount: 3,
        retryDelay: 1000,
      }),
    });

    console.log(`╔════════════════════════════════════════════════════════════╗`);
    console.log(`║          Standalone LP Deployer v2.0 Initialized         ║`);
    console.log(`╚════════════════════════════════════════════════════════════╝`);
    console.log(`\n🔧 Configuration:`);
    console.log(`   Network: ${this.network}`);
    console.log(`   RPC: ${rpcUrl}`);
    console.log(`   Wallet: ${account.address}`);
    console.log(`   LaunchTool: ${this.launchToolAddress}`);
    console.log(`   Factory: ${this.factoryAddress}`);
    console.log(`   Token Decimals: ${TOKEN_DECIMALS}`);
    console.log(`   Fee Tier: ${FEE_TIER / 10000}%`);
  }

  async start() {
    console.log(`\n🚀 Starting LP Deployer Monitor...`);
    console.log(`   Check interval: ${this.checkInterval / 1000}s\n`);

    // Initial check
    await this.checkAndDeployPendingLPs();

    // Start monitoring
    this.monitorInterval = setInterval(() => {
      this.checkAndDeployPendingLPs();
    }, this.checkInterval);
  }

  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      console.log("🛑 LP Deployer Monitor stopped");
    }
  }

  private async checkAndDeployPendingLPs() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Query tokens that are ready for LP deployment
      const result = await this.pool.query(
        `SELECT address, name, symbol, max_mint_count, pool_fee, 
                payment_token_address, payment_seed, pool_seed_amount, 
                lp_deployment_error, lp_deployment_error_at, lp_retry_count
         FROM deployed_tokens 
         WHERE liquidity_deployed = false 
         AND is_active = true
         AND (
           lp_deployment_error IS NULL
           OR
           (
             lp_deployment_error_at < NOW() - INTERVAL '5 minutes'
             AND COALESCE(lp_retry_count, 0) < 5
           )
         )
         ORDER BY 
           CASE WHEN lp_deployment_error IS NULL THEN 0 ELSE 1 END,
           created_at ASC`
      );

      if (result.rows.length === 0) return;

      console.log(`\n🔍 Found ${result.rows.length} token(s) pending LP deployment...`);

      for (const token of result.rows) {
        try {
          const isRetry = token.lp_deployment_error != null;
          const retryCount = token.lp_retry_count || 0;

          if (isRetry) {
            console.log(`\n🔄 Retrying ${token.symbol} (attempt ${retryCount + 1}/5)...`);
          } else {
            console.log(`\n🎯 Processing ${token.symbol}...`);
          }
          
          await this.processToken(
            token.address as `0x${string}`,
            token.name,
            token.symbol,
            token.payment_token_address as `0x${string}`,
            isRetry,
            retryCount
          );

          // Add delay between processing tokens to avoid rate limiting
          if (result.rows.length > 1) {
            console.log(`   ⏳ Waiting 2s before next token...`);
            await sleep(2000);
          }
        } catch (error: any) {
          console.error(`   ❌ Error processing ${token.symbol}:`, error.message);
        }
      }
    } catch (error: any) {
      console.error("❌ LP monitor error:", error.message);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processToken(
    tokenAddress: `0x${string}`,
    name: string,
    symbol: string,
    paymentTokenAddress: `0x${string}`,
    isRetry: boolean = false,
    retryCount: number = 0
  ) {
    const key = tokenAddress.toLowerCase();
    if (this.processingTokens.has(key)) {
      console.log(`   ⏭️  ${symbol}: Already processing, skipping...`);
      return;
    }

    this.processingTokens.add(key);

    try {
      console.log(`\n╔════════════════════════════════════════════════════════════╗`);
      console.log(`║  LP Deployment: ${symbol.padEnd(40)} ║`);
      console.log(`╚════════════════════════════════════════════════════════════╝`);

      // Step A: Pre-deployment checks
      const isReady = await this.stepA_PreChecks(tokenAddress, symbol);
      if (!isReady) {
        // Not ready yet (minting incomplete or LP already live)
        // Don't record as error, just skip and check again later
        return;
      }

      // Step A2: Set LaunchTool whitelist
      await this.stepA2_SetLaunchTool(tokenAddress, symbol);

      // Step A3: Transfer assets for LP (if needed)
      await this.stepA3_TransferAssets(tokenAddress, symbol);

      // Step B: Prepare LP deployer account
      const deployerInfo = await this.stepB_PrepareDeployer(tokenAddress, paymentTokenAddress, symbol);

      // Step B3-6: Calculate pool parameters
      const poolParams = await this.stepB_CalculateParams(
              tokenAddress,
              paymentTokenAddress,
        deployerInfo.tokenBalance,
        deployerInfo.mintAmount
      );

      // Step C: Create pool and add liquidity
      await this.stepC_CreatePool(tokenAddress, poolParams, symbol);

      // Step D: Confirm LP live
      await this.stepD_ConfirmLpLive(tokenAddress, symbol);

      // Step E: Verify deployment
      await this.stepE_Verify(tokenAddress, poolParams, symbol);

      // Update database
              await this.pool.query(
                `UPDATE deployed_tokens 
         SET liquidity_deployed = true, 
             liquidity_deployed_at = NOW(),
             lp_deployment_error = NULL,
                     lp_deployment_error_at = NULL
                 WHERE address = $1`,
        [tokenAddress]
      );

      console.log(`\n╔════════════════════════════════════════════════════════════╗`);
      console.log(`║              ✅ ${symbol} LP DEPLOYMENT COMPLETE!              ║`);
      console.log(`╚════════════════════════════════════════════════════════════╝\n`);

    } catch (error: any) {
      console.error(`\n❌ LP deployment failed for ${symbol}:`, error.message);
      
      // Update database with error
      await this.pool.query(
        `UPDATE deployed_tokens 
         SET lp_deployment_error = $1,
             lp_deployment_error_at = NOW(),
             lp_retry_count = COALESCE(lp_retry_count, 0) + 1
         WHERE address = $2`,
        [error.message.substring(0, 500), tokenAddress]
            );
          } finally {
      this.processingTokens.delete(key);
    }
  }

  // ==================== Deployment Steps ====================

  private async stepA_PreChecks(tokenAddress: `0x${string}`, symbol: string): Promise<boolean> {
    console.log(`\n📋 Step A: Pre-deployment Checks`);
    console.log(`${"=".repeat(60)}`);

    // Check minting completed
    const [mintingCompleted, mintCount, maxMintCount, assetsTransferred, lpLive] = await Promise.all([
      this.publicClient.readContract({
        address: tokenAddress,
        abi: tokenAbi,
        functionName: "mintingCompleted",
      }),
      this.publicClient.readContract({
        address: tokenAddress,
        abi: tokenAbi,
        functionName: "mintCount",
      }),
      this.publicClient.readContract({
        address: tokenAddress,
        abi: tokenAbi,
        functionName: "maxMintCount",
      }),
      this.publicClient.readContract({
        address: tokenAddress,
        abi: tokenAbi,
        functionName: "assetsTransferred",
      }),
      this.publicClient.readContract({
        address: tokenAddress,
        abi: tokenAbi,
        functionName: "lpLive",
      }),
    ]);

    console.log(`  Minting Status:`);
    console.log(`    - Completed: ${mintingCompleted}`);
    console.log(`    - Count: ${mintCount} / ${maxMintCount}`);
    console.log(`  Assets Transferred: ${assetsTransferred}`);
    console.log(`  LP Live: ${lpLive}`);

    if (!mintingCompleted) {
      console.log(`  ⏳ Minting not completed yet, will check again later...`);
      return false;
    }

    if (lpLive) {
      console.log(`  ⏭️  LP already live, skipping...`);
      return false;
    }

    console.log(`  ✅ All checks passed`);
    return true;
  }

  private async stepA2_SetLaunchTool(tokenAddress: `0x${string}`, symbol: string) {
    console.log(`\n🛠️  Step A2: Configure LaunchTool Whitelist`);
    console.log(`${"=".repeat(60)}`);

    const [currentLaunchTool, owner] = await Promise.all([
        this.publicClient.readContract({
          address: tokenAddress,
        abi: tokenAbi,
        functionName: "launchTool",
        }),
        this.publicClient.readContract({
        address: tokenAddress,
        abi: tokenAbi,
        functionName: "owner",
        }),
      ]);

    console.log(`  Current LaunchTool: ${currentLaunchTool}`);
    console.log(`  Target LaunchTool: ${this.launchToolAddress}`);
    console.log(`  Token Owner: ${owner}`);
    console.log(`  Wallet: ${this.walletClient.account.address}`);

    // Check if already set correctly
    if (currentLaunchTool.toLowerCase() === this.launchToolAddress.toLowerCase()) {
      console.log(`  ✅ LaunchTool already set correctly, skipping...`);
      return;
    }

    // Verify wallet is owner
    if (owner.toLowerCase() !== this.walletClient.account.address.toLowerCase()) {
      throw new Error(`Wallet is not the token owner`);
    }

    // Set LaunchTool
    console.log(`  Setting LaunchTool...`);
    const hash = await this.walletClient.writeContract({
      address: tokenAddress,
      abi: tokenAbi,
      functionName: "setLaunchTool",
      args: [this.launchToolAddress],
    });

    await waitForTransaction(this.publicClient, hash, "setLaunchTool", 2);

    // Verify
    const newLaunchTool = await this.publicClient.readContract({
      address: tokenAddress,
      abi: tokenAbi,
      functionName: "launchTool",
    });

    if (newLaunchTool.toLowerCase() !== this.launchToolAddress.toLowerCase()) {
      throw new Error("LaunchTool verification failed");
    }

    console.log(`  ✅ LaunchTool whitelist configured!`);
  }

  private async stepA3_TransferAssets(tokenAddress: `0x${string}`, symbol: string) {
    console.log(`\n💸 Step A3: Transfer Assets for LP`);
    console.log(`${"=".repeat(60)}`);

    const assetsTransferred = await this.publicClient.readContract({
      address: tokenAddress,
      abi: tokenAbi,
      functionName: "assetsTransferred",
    });

    if (assetsTransferred) {
      console.log(`  ✅ Assets already transferred, skipping...`);
      return;
    }

    console.log(`  Calling transferAssetsForLP()...`);
    const hash = await this.walletClient.writeContract({
      address: tokenAddress,
      abi: tokenAbi,
      functionName: "transferAssetsForLP",
    });

    await waitForTransaction(this.publicClient, hash, "transferAssetsForLP", 2);
    console.log(`  ✅ Assets transferred!`);
  }

  private async stepB_PrepareDeployer(
    tokenAddress: `0x${string}`,
    paymentTokenAddress: `0x${string}`,
    symbol: string
  ) {
    console.log(`\n🔧 Step B: Prepare LP Deployer Account`);
    console.log(`${"=".repeat(60)}`);

    const walletAddress = this.walletClient.account.address;

    // Get balances and info
    const [tokenBalance, usdcBalance, mintAmount] = await Promise.all([
      this.publicClient.readContract({
        address: tokenAddress,
        abi: tokenAbi,
        functionName: "balanceOf",
        args: [walletAddress],
      }),
      this.publicClient.readContract({
        address: paymentTokenAddress,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [walletAddress],
      }),
      this.publicClient.readContract({
        address: tokenAddress,
        abi: tokenAbi,
        functionName: "MINT_AMOUNT",
      }),
    ]);

    console.log(`  Wallet: ${walletAddress}`);
    console.log(`  Balances:`);
    console.log(`    - Token: ${formatUnits(tokenBalance, TOKEN_DECIMALS)} ${symbol}`);
    console.log(`    - USDC: ${formatUnits(usdcBalance, USDC_DECIMALS)}`);
    console.log(`  MINT_AMOUNT: ${formatUnits(mintAmount, TOKEN_DECIMALS)} ${symbol}`);

    if (tokenBalance === 0n) {
      throw new Error("Insufficient token balance");
    }

    // Approve tokens to LaunchTool
    console.log(`\n  Approving tokens to LaunchTool...`);

    // Check and approve token
    const tokenAllowance = await this.publicClient.readContract({
      address: tokenAddress,
      abi: tokenAbi,
      functionName: "allowance",
      args: [walletAddress, this.launchToolAddress],
    });

    if (tokenAllowance < tokenBalance) {
      console.log(`    - Approving ${symbol}...`);
      const hash = await this.walletClient.writeContract({
        address: tokenAddress,
        abi: tokenAbi,
        functionName: "approve",
        args: [this.launchToolAddress, BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")],
      });
      await waitForTransaction(this.publicClient, hash, "Token approval", 2);
    } else {
      console.log(`    - ${symbol} already approved`);
    }

    // Check and approve USDC
    const usdcAllowance = await this.publicClient.readContract({
      address: paymentTokenAddress,
      abi: erc20Abi,
      functionName: "allowance",
      args: [walletAddress, this.launchToolAddress],
    });

    if (usdcAllowance < usdcBalance) {
      console.log(`    - Approving USDC...`);
      const hash = await this.walletClient.writeContract({
        address: paymentTokenAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [this.launchToolAddress, BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")],
      });
      await waitForTransaction(this.publicClient, hash, "USDC approval", 2);
    } else {
      console.log(`    - USDC already approved`);
    }

    console.log(`  ✅ Approvals completed`);

    return {
      tokenBalance,
      usdcBalance,
      mintAmount,
    };
  }

  private async stepB_CalculateParams(
    tokenAddress: `0x${string}`,
    paymentTokenAddress: `0x${string}`,
    tokenBalance: bigint,
    mintAmount: bigint
  ) {
    console.log(`\n🧮 Step B3-6: Calculate Pool Parameters`);
    console.log(`${"=".repeat(60)}`);

    // Target price: 1 USDC = MINT_AMOUNT tokens
    // So: 1 token = (1 / MINT_AMOUNT) USDC
    const mintAmountFloat = parseFloat(formatUnits(mintAmount, TOKEN_DECIMALS));
    const pricePerToken = 1.0 / mintAmountFloat; // USDC per token

    console.log(`  Target Price:`);
    console.log(`    - 1 USDC = ${mintAmountFloat} tokens`);
    console.log(`    - 1 token = ${pricePerToken.toFixed(6)} USDC`);

    // Calculate required USDC based on token balance
    const tokenAmountFloat = parseFloat(formatUnits(tokenBalance, TOKEN_DECIMALS));
    const requiredUsdcFloat = tokenAmountFloat * pricePerToken;
    const requiredUsdc = parseUnits(requiredUsdcFloat.toFixed(USDC_DECIMALS), USDC_DECIMALS);

    console.log(`  Amount Calculation:`);
    console.log(`    - Token amount: ${tokenAmountFloat.toFixed(6)}`);
    console.log(`    - Required USDC: ${requiredUsdcFloat.toFixed(6)}`);

    // Determine token0/token1 order
    let token0: `0x${string}`, token1: `0x${string}`, amount0: bigint, amount1: bigint;
    let decimals0: number, decimals1: number;

    if (paymentTokenAddress.toLowerCase() < tokenAddress.toLowerCase()) {
      token0 = paymentTokenAddress;
      token1 = tokenAddress;
      amount0 = requiredUsdc;
      amount1 = tokenBalance;
      decimals0 = USDC_DECIMALS;
      decimals1 = TOKEN_DECIMALS;
    } else {
      token0 = tokenAddress;
      token1 = paymentTokenAddress;
      amount0 = tokenBalance;
      amount1 = requiredUsdc;
      decimals0 = TOKEN_DECIMALS;
      decimals1 = USDC_DECIMALS;
    }

    console.log(`\n  Token Ordering:`);
    console.log(`    - token0: ${token0} (${decimals0} decimals)`);
    console.log(`    - token1: ${token1} (${decimals1} decimals)`);
    console.log(`    - amount0: ${formatUnits(amount0, decimals0)}`);
    console.log(`    - amount1: ${formatUnits(amount1, decimals1)}`);

    // Calculate sqrtPriceX96
    let priceToken1PerToken0: number;
    if (token0.toLowerCase() === paymentTokenAddress.toLowerCase()) {
      // token0 = USDC, token1 = Token
      // price = token1/token0 = Token/USDC = 1/pricePerToken
      priceToken1PerToken0 = 1.0 / pricePerToken;
    } else {
      // token0 = Token, token1 = USDC
      // price = token1/token0 = USDC/Token = pricePerToken
      priceToken1PerToken0 = pricePerToken;
    }

    console.log(`  Price Configuration:`);
    console.log(`    - Calculated price (token1/token0): ${priceToken1PerToken0}`);

    const sqrtPriceX96 = calculateSqrtPriceX96(priceToken1PerToken0, decimals0, decimals1);
    console.log(`    - sqrtPriceX96: ${sqrtPriceX96.toString()}`);

    // Calculate tick range
    const currentTick = getTickAtSqrtRatio(sqrtPriceX96);
    const tickWidth = TICK_RANGE_WIDTH * TICK_SPACING;

    const tickLower = floorToSpacing(currentTick - tickWidth, TICK_SPACING);
    const tickUpper = floorToSpacing(currentTick + tickWidth, TICK_SPACING);

    console.log(`  Tick Range:`);
    console.log(`    - Current Tick (approx): ${currentTick}`);
    console.log(`    - Tick Width: ±${tickWidth}`);
    console.log(`    - tickLower: ${tickLower}`);
    console.log(`    - tickUpper: ${tickUpper}`);

    // Validate tick range
    if (tickLower < MIN_TICK || tickUpper > MAX_TICK) {
      throw new Error(`Tick range out of bounds! MIN=${MIN_TICK}, MAX=${MAX_TICK}`);
    }

    return {
      token0,
      token1,
      amount0,
      amount1,
      sqrtPriceX96,
      tickLower,
      tickUpper,
      fee: FEE_TIER,
    };
  }

  private async stepC_CreatePool(
    tokenAddress: `0x${string}`,
    poolParams: any,
    symbol: string
  ) {
    console.log(`\n🏊 Step C: Create Pool and Add Liquidity`);
    console.log(`${"=".repeat(60)}`);

    console.log(`  Parameters:`);
    console.log(`    - token0: ${poolParams.token0}`);
    console.log(`    - token1: ${poolParams.token1}`);
    console.log(`    - amount0: ${poolParams.amount0.toString()}`);
    console.log(`    - amount1: ${poolParams.amount1.toString()}`);
    console.log(`    - sqrtPriceX96: ${poolParams.sqrtPriceX96.toString()}`);
    console.log(`    - tickLower: ${poolParams.tickLower}`);
    console.log(`    - tickUpper: ${poolParams.tickUpper}`);
    console.log(`    - fee: ${poolParams.fee}`);

    console.log(`\n  Calling LaunchTool.configurePoolByAmount()...`);

    const hash = await this.walletClient.writeContract({
      address: this.launchToolAddress,
      abi: launchToolAbi,
      functionName: "configurePoolByAmount",
      args: [
        poolParams.token0,
        poolParams.token1,
        poolParams.amount0,
        poolParams.amount1,
        poolParams.sqrtPriceX96,
        poolParams.tickLower,
        poolParams.tickUpper,
        poolParams.fee,
      ],
    });

    await waitForTransaction(this.publicClient, hash, "configurePoolByAmount", 3);
    console.log(`  ✅ Pool created and liquidity added!`);
  }

  private async stepD_ConfirmLpLive(tokenAddress: `0x${string}`, symbol: string) {
    console.log(`\n✅ Step D: Confirm LP Live`);
    console.log(`${"=".repeat(60)}`);

    console.log(`  Calling confirmLpLive()...`);
    const hash = await this.walletClient.writeContract({
      address: tokenAddress,
      abi: tokenAbi,
      functionName: "confirmLpLive",
    });

    await waitForTransaction(this.publicClient, hash, "confirmLpLive", 2);
    console.log(`  ✅ LP confirmed live!`);
  }

  private async stepE_Verify(
    tokenAddress: `0x${string}`,
    poolParams: any,
    symbol: string
  ) {
    console.log(`\n🔍 Step E: Verification`);
    console.log(`${"=".repeat(60)}`);

    // Verify pool exists
    const poolAddress = await this.publicClient.readContract({
      address: this.factoryAddress,
      abi: factoryAbi,
      functionName: "getPool",
      args: [poolParams.token0, poolParams.token1, poolParams.fee],
    });

    console.log(`  Pool Address: ${poolAddress}`);

    if (poolAddress === "0x0000000000000000000000000000000000000000") {
      throw new Error("Pool not found!");
    }

    // Check pool state
    const slot0 = await this.publicClient.readContract({
      address: poolAddress,
      abi: poolAbi,
      functionName: "slot0",
    });

    console.log(`  Pool State:`);
    console.log(`    - Current sqrtPriceX96: ${slot0[0].toString()}`);
    console.log(`    - Current tick: ${slot0[1]}`);
    console.log(`    - Expected sqrtPriceX96: ${poolParams.sqrtPriceX96.toString()}`);

    // Check LP live status
    const lpLive = await this.publicClient.readContract({
      address: tokenAddress,
      abi: tokenAbi,
      functionName: "lpLive",
    });

    console.log(`  LP Live Status: ${lpLive}`);

    if (!lpLive) {
      throw new Error("LP not marked as live");
    }

    const explorerBase = this.network === "base"
      ? "https://basescan.org"
      : "https://sepolia.basescan.org";

    console.log(`\n  🔗 Links:`);
    console.log(`    - Pool: ${explorerBase}/address/${poolAddress}`);
    console.log(`    - Token: ${explorerBase}/address/${tokenAddress}`);

    console.log(`  ✅ Verification completed!`);
  }
}

// ==================== Main ====================

async function main() {
  const deployer = new StandaloneLPDeployer();

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n\n🛑 Received SIGINT, shutting down gracefully...");
    deployer.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n\n🛑 Received SIGTERM, shutting down gracefully...");
    deployer.stop();
    process.exit(0);
  });

  await deployer.start();
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
