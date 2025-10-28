#!/usr/bin/env node
/**
 * Standalone LP Deployer Service
 * Monitors database for tokens ready for LP deployment and deploys them
 * Run independently from the main server
 */

import { Pool } from "pg";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";
import * as dotenv from "dotenv";

dotenv.config();

const tokenAbi = parseAbi([
  "function mintCount() view returns (uint256)",
  "function maxMintCount() view returns (uint256)",
  "function assetsTransferred() view returns (bool)",
  "function transferAssetsForLP() external",
  "function balanceOf(address) view returns (uint256)",
]);

const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function decimals() view returns (uint8)",
]);

const positionManagerAbi = parseAbi([
  "function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96) external payable returns (address pool)",
  "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
]);

const poolAbi = parseAbi([
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
]);

const factoryAbi = parseAbi([
  "function getPool(address tokenA, address tokenB, uint24 fee) view returns (address pool)",
]);

interface MintParams {
  token0: `0x${string}`;
  token1: `0x${string}`;
  fee: number;
  tickLower: number;
  tickUpper: number;
  amount0Desired: bigint;
  amount1Desired: bigint;
  amount0Min: bigint;
  amount1Min: bigint;
  recipient: `0x${string}`;
  deadline: bigint;
}

class StandaloneLPDeployer {
  private pool: Pool;
  private adminWalletClient: any;
  private lpWalletClient: any;
  private publicClient: any;
  private positionManagerAddress: `0x${string}`;
  private factoryAddress: `0x${string}`;
  private checkInterval: number = 15000; // 15 seconds
  private monitorInterval: NodeJS.Timeout | null = null;
  private processingTokens: Set<string> = new Set();
  private isProcessing: boolean = false;

  constructor() {
    // Validate environment variables
    const missingVars: string[] = [];
    if (!process.env.DATABASE_URL) missingVars.push("DATABASE_URL");
    if (!process.env.PRIVATE_KEY) missingVars.push("PRIVATE_KEY");
    if (!process.env.LP_DEPLOYER_PRIVATE_KEY) missingVars.push("LP_DEPLOYER_PRIVATE_KEY");

    if (missingVars.length > 0) {
      console.error("\n❌ Missing required environment variables:");
      missingVars.forEach(v => console.error(`   - ${v}`));
      console.error("\n💡 To fix:");
      console.error("   1. Create .env file: cp env.multi-token.example .env");
      console.error("   2. Set DATABASE_URL, PRIVATE_KEY, LP_DEPLOYER_PRIVATE_KEY");
      console.error("\n📖 Example:");
      console.error("   DATABASE_URL=postgresql://user:pass@localhost:5432/token_mint");
      console.error("   PRIVATE_KEY=0x...");
      console.error("   LP_DEPLOYER_PRIVATE_KEY=0x...\n");
      throw new Error("Missing required environment variables");
    }

    // Database with SSL support
    const databaseUrl = process.env.DATABASE_URL;
    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: databaseUrl?.includes('sslmode=require') ? {
        rejectUnauthorized: false // For self-signed certificates
      } : false,
    });

    // Network config
    const network = process.env.NETWORK || "baseSepolia";
    const chain = network === "base" ? base : baseSepolia;
    const rpcUrl = network === "base"
      ? (process.env.BASE_RPC_URL || "https://mainnet.base.org")
      : (process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org");

    // Position Manager and Factory addresses
    this.positionManagerAddress = (network === "base"
      ? "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1"
      : "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2") as `0x${string}`;
    
    this.factoryAddress = (network === "base"
      ? "0x33128a8fC17869897dcE68Ed026d694621f6FDfD"
      : "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24") as `0x${string}`;

    // Clients
    this.publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl),
    });

    // Admin wallet (for calling transferAssetsForLP)
    const adminAccount = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
    this.adminWalletClient = createWalletClient({
      account: adminAccount,
      chain,
      transport: http(rpcUrl),
    });

    // LP deployer wallet (for deploying LP)
    const lpAccount = privateKeyToAccount(process.env.LP_DEPLOYER_PRIVATE_KEY as `0x${string}`);
    this.lpWalletClient = createWalletClient({
      account: lpAccount,
      chain,
      transport: http(rpcUrl),
    });

    console.log(`🔧 Standalone LP Deployer initialized`);
    console.log(`   Network: ${network}`);
    console.log(`   RPC: ${rpcUrl}`);
    console.log(`   Admin: ${adminAccount.address}`);
    console.log(`   LP Deployer: ${lpAccount.address}`);
    console.log(`   Position Manager: ${this.positionManagerAddress}`);
    console.log(`   Factory: ${this.factoryAddress}`);
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

      console.log(`\n🔍 Checking ${result.rows.length} token(s) for LP deployment readiness...`);

      for (const token of result.rows) {
        try {
          const isRetry = token.lp_deployment_error != null;
          const retryCount = token.lp_retry_count || 0;

          if (isRetry) {
            console.log(`   🔄 Retrying ${token.symbol} (attempt ${retryCount + 1}/5)...`);
          }

          // USDC for LP = payment_seed (direct from DB)
          const usdcForLP = BigInt(token.payment_seed);
          
          // Token for LP = pool_seed_amount (direct from DB)
          const tokenForLP = BigInt(token.pool_seed_amount);
          
          await this.processToken(
            token.address as `0x${string}`,
            token.name,
            token.symbol,
            token.max_mint_count,
            token.pool_fee || 3000,
            token.payment_token_address as `0x${string}`,
            tokenForLP,
            usdcForLP,
            isRetry,
            retryCount
          );
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
    maxMintCountDB: number,
    poolFee: number,
    paymentTokenAddress: `0x${string}`,
    tokenForLP: bigint,
    usdcForLP: bigint,
    isRetry: boolean = false,
    retryCount: number = 0
  ) {
    if (this.processingTokens.has(tokenAddress.toLowerCase())) {
      console.log(`   ⏭️  ${symbol}: Already processing, skipping...`);
      return;
    }

    try {
      // Check if this is a new (Simple) contract
      let assetsTransferred: boolean;
      try {
        assetsTransferred = await this.publicClient.readContract({
          address: tokenAddress,
          abi: tokenAbi,
          functionName: "assetsTransferred",
        }) as boolean;
      } catch (e) {
        console.log(`   ⏭️  ${symbol}: Old contract (no assetsTransferred function), skipping...`);
        return;
      }

      const [mintCount, maxMintCount] = await Promise.all([
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
      ]);

      const mintProgress = Number(mintCount) / Number(maxMintCount) * 100;
      console.log(`   📊 ${symbol}: ${mintCount}/${maxMintCount} mints (${mintProgress.toFixed(1)}%)`);

      if (mintCount >= maxMintCount) {
        if (!assetsTransferred) {
          if (!isRetry) {
            console.log(`\n🎉 ${symbol} is ready for asset transfer and LP deployment!`);
          }

          this.processingTokens.add(tokenAddress.toLowerCase());

          try {
            if (isRetry) {
              await this.pool.query(
                `UPDATE deployed_tokens 
                 SET lp_deployment_error = NULL,
                     lp_deployment_error_at = NULL
                 WHERE address = $1`,
                [tokenAddress.toLowerCase()]
              );
            }

            await this.transferAssetsAndDeployLP(
              tokenAddress,
              name,
              symbol,
              poolFee,
              paymentTokenAddress,
              tokenForLP,
              usdcForLP,
              retryCount
            );
          } finally {
            this.processingTokens.delete(tokenAddress.toLowerCase());
          }
        } else {
          console.log(`\n💰 ${symbol}: Assets already transferred, deploying LP only...`);

          this.processingTokens.add(tokenAddress.toLowerCase());

          try {
            if (isRetry) {
              await this.pool.query(
                `UPDATE deployed_tokens 
                 SET lp_deployment_error = NULL,
                     lp_deployment_error_at = NULL
                 WHERE address = $1`,
                [tokenAddress.toLowerCase()]
              );
            }

            await this.deployLPOnly(
              tokenAddress,
              name,
              symbol,
              poolFee,
              paymentTokenAddress,
              tokenForLP,
              usdcForLP,
              retryCount
            );
          } finally {
            this.processingTokens.delete(tokenAddress.toLowerCase());
          }
        }
      }
    } catch (error: any) {
      console.error(`   ❌ Failed to check ${symbol}:`, error.message);
    }
  }

  private async transferAssetsAndDeployLP(
    tokenAddress: `0x${string}`,
    name: string,
    symbol: string,
    poolFee: number,
    paymentTokenAddress: `0x${string}`,
    tokenForLP: bigint,
    usdcForLP: bigint,
    retryCount: number = 0
  ) {
    try {
      console.log(`\n💧 Deploying LP for ${symbol} (${tokenAddress})...`);
      console.log(`   Pool config: fee=${poolFee} (${poolFee/10000}%)`);

      // EIP-1559 省钱模式
      const block = await this.publicClient.getBlock();
      const baseFeePerGas = block.baseFeePerGas || 100000000n; // 0.1 gwei
      const maxPriorityFeePerGas = 10000000n; // 0.01 gwei (LP 部署可以稍微快一点)
      const maxFeePerGas = (baseFeePerGas * 120n) / 100n + maxPriorityFeePerGas; // 20% buffer

      console.log(`   💰 EIP-1559 Gas:`);
      console.log(`      - Base Fee: ${Number(baseFeePerGas) / 1e9} gwei`);
      console.log(`      - Max Fee: ${Number(maxFeePerGas) / 1e9} gwei`);

      const lpDeployerAddress = this.lpWalletClient.account!.address;

      // Step 1: Transfer assets
      console.log(`   📍 Step 1: Transferring assets to LP deployer (${lpDeployerAddress})...`);

      const transferHash = await this.adminWalletClient.writeContract({
        address: tokenAddress,
        abi: tokenAbi,
        functionName: "transferAssetsForLP",
        gas: 300000n,
        maxFeePerGas,
        maxPriorityFeePerGas,
      } as any);

      console.log(`   ⏳ Waiting for asset transfer: ${transferHash}`);
      const transferReceipt = await this.publicClient.waitForTransactionReceipt({
        hash: transferHash,
        confirmations: 1,
      });

      if (transferReceipt.status !== "success") {
        throw new Error(`Asset transfer failed: ${transferHash}`);
      }

      console.log(`   ✅ Assets transferred!`);
      
      // Wait for balances to update
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check balances
      const [tokenBalance, usdcBalance] = await Promise.all([
        this.publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [lpDeployerAddress],
        }),
        this.publicClient.readContract({
          address: paymentTokenAddress,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [lpDeployerAddress],
        }),
      ]);

      console.log(`   💰 LP Deployer balances:`);
      console.log(`      Token: ${tokenBalance.toString()}`);
      console.log(`      USDC: ${usdcBalance.toString()}`);
      console.log(`      Expected Token for LP: ${tokenForLP.toString()}`);
      console.log(`      Expected USDC for LP: ${usdcForLP.toString()}`);

      if (tokenBalance < tokenForLP) {
        throw new Error(`Insufficient token balance: have ${tokenBalance}, need ${tokenForLP}`);
      }

      if (usdcBalance < usdcForLP) {
        throw new Error(`Insufficient USDC balance: have ${usdcBalance}, need ${usdcForLP}`);
      }

      // Continue with LP deployment using the expected amounts
      await this.deployLP(tokenAddress, name, symbol, poolFee, paymentTokenAddress, tokenForLP, usdcForLP, retryCount);

    } catch (error: any) {
      console.error(`\n❌ LP deployment failed for ${symbol}:`, error.message);

      const newRetryCount = retryCount + 1;
      const maxRetries = 5;

      if (newRetryCount >= maxRetries) {
        console.error(`   ⛔ Max retries (${maxRetries}) reached. Manual intervention required.`);
      } else {
        console.log(`   🔄 Will retry automatically (${newRetryCount}/${maxRetries})`);
      }

      await this.pool.query(
        `UPDATE deployed_tokens 
         SET lp_deployment_error = $1,
             lp_deployment_error_at = NOW(),
             lp_retry_count = $3
         WHERE address = $2`,
        [error.message, tokenAddress.toLowerCase(), newRetryCount]
      );
    }
  }

  private async deployLPOnly(
    tokenAddress: `0x${string}`,
    name: string,
    symbol: string,
    poolFee: number,
    paymentTokenAddress: `0x${string}`,
    tokenForLP: bigint,
    usdcForLP: bigint,
    retryCount: number = 0
  ) {
    try {
      console.log(`\n💧 Deploying LP for ${symbol} (${tokenAddress})...`);
      console.log(`   ℹ️  Assets already transferred, skipping transfer step`);
      console.log(`   Pool config: fee=${poolFee} (${poolFee/10000}%)`);

      const lpDeployerAddress = this.lpWalletClient.account!.address;

      // Check balances
      const [tokenBalance, usdcBalance] = await Promise.all([
        this.publicClient.readContract({
          address: tokenAddress,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [lpDeployerAddress],
        }),
        this.publicClient.readContract({
          address: paymentTokenAddress,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [lpDeployerAddress],
        }),
      ]);

      console.log(`   💰 LP Deployer balances:`);
      console.log(`      Token: ${tokenBalance.toString()}`);
      console.log(`      USDC: ${usdcBalance.toString()}`);
      console.log(`      Expected Token for LP: ${tokenForLP.toString()}`);
      console.log(`      Expected USDC for LP: ${usdcForLP.toString()}`);

      if (tokenBalance < tokenForLP) {
        throw new Error(`Insufficient token balance: have ${tokenBalance}, need ${tokenForLP}`);
      }

      if (usdcBalance < usdcForLP) {
        throw new Error(`Insufficient USDC balance: have ${usdcBalance}, need ${usdcForLP}`);
      }

      await this.deployLP(tokenAddress, name, symbol, poolFee, paymentTokenAddress, tokenForLP, usdcForLP, retryCount);

    } catch (error: any) {
      console.error(`\n❌ LP deployment failed for ${symbol}:`, error.message);

      const newRetryCount = retryCount + 1;
      const maxRetries = 5;

      if (newRetryCount >= maxRetries) {
        console.error(`   ⛔ Max retries (${maxRetries}) reached. Manual intervention required.`);
      } else {
        console.log(`   🔄 Will retry automatically (${newRetryCount}/${maxRetries})`);
      }

      await this.pool.query(
        `UPDATE deployed_tokens 
         SET lp_deployment_error = $1,
             lp_deployment_error_at = NOW(),
             lp_retry_count = $3
         WHERE address = $2`,
        [error.message, tokenAddress.toLowerCase(), newRetryCount]
      );
    }
  }

  private async deployLP(
    tokenAddress: `0x${string}`,
    name: string,
    symbol: string,
    poolFee: number,
    paymentTokenAddress: `0x${string}`,
    tokenAmount: bigint,
    usdcAmount: bigint,
    retryCount: number
  ) {
    // EIP-1559 省钱模式
    const block = await this.publicClient.getBlock();
    const baseFeePerGas = block.baseFeePerGas || 100000000n; // 0.1 gwei
    const maxPriorityFeePerGas = 10000000n; // 0.01 gwei
    const maxFeePerGas = (baseFeePerGas * 120n) / 100n + maxPriorityFeePerGas;

    console.log(`   💰 EIP-1559 Gas:`);
    console.log(`      - Base Fee: ${Number(baseFeePerGas) / 1e9} gwei`);
    console.log(`      - Max Fee: ${Number(maxFeePerGas) / 1e9} gwei`);

    const lpDeployerAddress = this.lpWalletClient.account!.address;

    // Step 1: Create and initialize pool
    console.log(`   📍 Step 1: Creating/initializing Uniswap V3 pool...`);

    const [token0, token1] = paymentTokenAddress < tokenAddress
      ? [paymentTokenAddress, tokenAddress]
      : [tokenAddress, paymentTokenAddress];

    const [balance0, balance1] = paymentTokenAddress < tokenAddress
      ? [usdcAmount, tokenAmount]
      : [tokenAmount, usdcAmount];

    // Read decimals for both tokens
    console.log(`   🔍 Reading token decimals...`);
    const [decimals0, decimals1] = await Promise.all([
      this.publicClient.readContract({
        address: token0,
        abi: erc20Abi,
        functionName: "decimals",
      }) as Promise<number>,
      this.publicClient.readContract({
        address: token1,
        abi: erc20Abi,
        functionName: "decimals",
      }) as Promise<number>,
    ]);

    console.log(`      token0 (${token0}): ${decimals0} decimals`);
    console.log(`      token1 (${token1}): ${decimals1} decimals`);

    // Calculate sqrtPriceX96 with decimal normalization
    // price = (balance1/10^decimals1) / (balance0/10^decimals0)
    //       = balance1 * 10^decimals0 / (balance0 * 10^decimals1)
    // sqrtPriceX96 = sqrt(price) * 2^96
    const Q96 = 2n ** 96n;
    const MIN_SQRT_RATIO = 4295128739n;
    const MAX_SQRT_RATIO = 1461446703485210103287273052203988822378723970342n;

    const scale0 = 10n ** BigInt(decimals0);
    const scale1 = 10n ** BigInt(decimals1);

    if (balance0 === 0n || balance1 === 0n) {
      throw new Error(`Zero balance: balance0=${balance0}, balance1=${balance1}`);
    }

    // numerator = balance1 * 10^decimals0 * 2^192
    // denominator = balance0 * 10^decimals1
    const numerator = balance1 * scale0 * Q96 * Q96;
    const denominator = balance0 * scale1;

    let sqrtPriceX96 = this.sqrt(numerator / denominator);

    // Clamp to valid range
    if (sqrtPriceX96 <= MIN_SQRT_RATIO) {
      console.log(`   ⚠️  sqrtPriceX96 ${sqrtPriceX96} too low, clamping to ${MIN_SQRT_RATIO + 1n}`);
      sqrtPriceX96 = MIN_SQRT_RATIO + 1n;
    }
    if (sqrtPriceX96 >= MAX_SQRT_RATIO) {
      console.log(`   ⚠️  sqrtPriceX96 ${sqrtPriceX96} too high, clamping to ${MAX_SQRT_RATIO - 1n}`);
      sqrtPriceX96 = MAX_SQRT_RATIO - 1n;
    }

    console.log(`   💱 Price calculation (decimals-aware):`);
    console.log(`      balance0: ${balance0.toString()}`);
    console.log(`      balance1: ${balance1.toString()}`);
    console.log(`      sqrtPriceX96: ${sqrtPriceX96.toString()}`);

    // Check if pool already exists
    const poolAddress = await this.publicClient.readContract({
      address: this.factoryAddress,
      abi: factoryAbi,
      functionName: "getPool",
      args: [token0, token1, poolFee],
    }) as `0x${string}`;

    if (poolAddress && poolAddress !== '0x0000000000000000000000000000000000000000') {
      console.log(`   ℹ️  Pool already exists at: ${poolAddress}`);
      
      // Read current price from pool
      try {
        const slot0 = await this.publicClient.readContract({
          address: poolAddress,
          abi: poolAbi,
          functionName: "slot0",
        }) as any;
        
        const currentSqrtPriceX96 = slot0[0];
        console.log(`   📊 Current pool sqrtPriceX96: ${currentSqrtPriceX96.toString()}`);
        console.log(`   📊 Desired pool sqrtPriceX96: ${sqrtPriceX96.toString()}`);
        
        const priceDiff = currentSqrtPriceX96 > sqrtPriceX96 
          ? (currentSqrtPriceX96 * 100n) / sqrtPriceX96 - 100n
          : (sqrtPriceX96 * 100n) / currentSqrtPriceX96 - 100n;
        
        if (priceDiff > 10n) {
          console.log(`   ⚠️  WARNING: Pool price differs by ${priceDiff}% from desired price!`);
          console.log(`   ⚠️  Pool was likely initialized with wrong decimals. Consider using different fee tier.`);
        } else {
          console.log(`   ✅ Pool price is within acceptable range (${priceDiff}% difference)`);
        }
      } catch (e) {
        console.log(`   ⚠️  Could not read pool state:`, e);
      }
    } else {
      console.log(`   ℹ️  Pool does not exist yet, will be created with correct price`);
    }

    try {
      const poolHash = await this.lpWalletClient.writeContract({
        address: this.positionManagerAddress,
        abi: positionManagerAbi,
        functionName: "createAndInitializePoolIfNecessary",
        args: [token0, token1, poolFee, sqrtPriceX96],
        gas: 500000n,
        maxFeePerGas,
        maxPriorityFeePerGas,
      } as any);

      await this.publicClient.waitForTransactionReceipt({
        hash: poolHash,
        confirmations: 1,
      });
      console.log(`   ✅ Pool ready: ${poolHash}`);
      
      // Wait before next transaction
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (poolError: any) {
      if (poolError.message.includes("Already initialized") ||
          poolError.message.includes("AI") ||
          poolError.message.toLowerCase().includes("initialized")) {
        console.log(`   ℹ️  Pool already initialized (cannot change price)`);
      } else {
        console.log(`   ⚠️  Pool init warning: ${poolError.message}`);
      }
    }

    // Step 2: Approve tokens
    console.log(`   📍 Step 2: Approving tokens...`);

    const [amount0, amount1] = paymentTokenAddress < tokenAddress
      ? [usdcAmount, tokenAmount]
      : [tokenAmount, usdcAmount];

    // Approve token0 with explicit nonce
    console.log(`   ⏳ Approving ${token0}...`);
    const approve0Hash = await this.lpWalletClient.writeContract({
      address: token0,
      abi: erc20Abi,
      functionName: "approve",
      args: [this.positionManagerAddress, amount0],
      gas: 100000n,
      maxFeePerGas,
      maxPriorityFeePerGas,
    } as any);
    const approve0Receipt = await this.publicClient.waitForTransactionReceipt({ 
      hash: approve0Hash,
      confirmations: 1 
    });
    console.log(`   ✅ Token0 approved (${approve0Hash})`);

    // Wait a bit before next transaction to ensure nonce is updated
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Approve token1
    console.log(`   ⏳ Approving ${token1}...`);
    const approve1Hash = await this.lpWalletClient.writeContract({
      address: token1,
      abi: erc20Abi,
      functionName: "approve",
      args: [this.positionManagerAddress, amount1],
      gas: 100000n,
      maxFeePerGas,
      maxPriorityFeePerGas,
    } as any);
    const approve1Receipt = await this.publicClient.waitForTransactionReceipt({ 
      hash: approve1Hash,
      confirmations: 1 
    });
    console.log(`   ✅ Token1 approved (${approve1Hash})`);

    // Wait a bit before minting
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log(`   ✅ All approvals complete`);

    // Step 3: Mint LP position
    console.log(`   📍 Step 3: Minting LP position...`);

    // Calculate valid ticks based on fee tier
    // Fee tier determines tick spacing:
    // 500 (0.05%) => spacing 10
    // 3000 (0.3%) => spacing 60
    // 10000 (1%) => spacing 200
    let tickSpacing: number;
    if (poolFee === 500) {
      tickSpacing = 10;
    } else if (poolFee === 3000) {
      tickSpacing = 60;
    } else if (poolFee === 10000) {
      tickSpacing = 200;
    } else {
      // Default to 60 for unknown fee tiers
      tickSpacing = 60;
    }

    // Use maximum range, but ensure ticks are multiples of tickSpacing
    // Uniswap V3 min/max ticks are -887272 and 887272
    // For negative ticks, round UP (toward zero) to stay within range
    // For positive ticks, round DOWN (toward zero) to stay within range
    const MIN_TICK = -887272;
    const MAX_TICK = 887272;
    
    const tickLower = Math.ceil(MIN_TICK / tickSpacing) * tickSpacing;
    const tickUpper = Math.floor(MAX_TICK / tickSpacing) * tickSpacing;

    console.log(`   🎯 Tick config: fee=${poolFee}, spacing=${tickSpacing}, range=[${tickLower}, ${tickUpper}]`);

    const mintParams: MintParams = {
      token0,
      token1,
      fee: poolFee,
      tickLower,
      tickUpper,
      amount0Desired: amount0,
      amount1Desired: amount1,
      amount0Min: 0n,
      amount1Min: 0n,
      recipient: lpDeployerAddress,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
    };

    // First, simulate the transaction to catch any errors
    console.log(`   🔍 Simulating mint transaction...`);
    try {
      await this.publicClient.simulateContract({
        address: this.positionManagerAddress,
        abi: positionManagerAbi,
        functionName: "mint",
        args: [mintParams],
        account: this.lpWalletClient.account,
      });
      console.log(`   ✅ Simulation successful`);
    } catch (simError: any) {
      console.error(`   ❌ Simulation failed:`, simError);
      throw new Error(`Mint simulation failed: ${simError.message || simError}`);
    }

    let mintHash: `0x${string}`;
    try {
      mintHash = await this.lpWalletClient.writeContract({
        address: this.positionManagerAddress,
        abi: positionManagerAbi,
        functionName: "mint",
        args: [mintParams],
        gas: 1000000n,
        maxFeePerGas,
        maxPriorityFeePerGas,
      } as any);

      console.log(`   ⏳ Waiting for LP position mint: ${mintHash}`);
    } catch (mintError: any) {
      console.error(`   ❌ Mint transaction failed to submit:`, mintError);
      throw new Error(`Failed to submit mint tx: ${mintError.message || mintError}`);
    }

    const mintReceipt = await this.publicClient.waitForTransactionReceipt({
      hash: mintHash,
      confirmations: 1,
    });

    if (mintReceipt.status !== "success") {
      // Try to get revert reason
      console.error(`   ❌ Mint transaction reverted. Receipt:`, JSON.stringify(mintReceipt, null, 2));
      throw new Error(`LP mint reverted: ${mintHash}. Check Base Sepolia explorer for details.`);
    }

    console.log(`   ✅ LP position minted successfully!`);
    console.log(`   Block: ${mintReceipt.blockNumber}`);
    console.log(`   Gas used: ${mintReceipt.gasUsed.toString()}`);

    // Update database
    await this.pool.query(
      `UPDATE deployed_tokens 
       SET liquidity_deployed = true, 
           liquidity_tx_hash = $1,
           liquidity_deployed_at = NOW()
       WHERE address = $2`,
      [mintHash, tokenAddress.toLowerCase()]
    );

    console.log(`   ✅ Database updated`);
    console.log(`\n🎊 LP deployment complete for ${symbol}!\n`);
  }

  private sqrt(value: bigint): bigint {
    if (value < 0n) {
      throw new Error("Square root of negative numbers is not supported");
    }
    if (value < 2n) {
      return value;
    }

    let x0 = value;
    let x1 = (value / 2n) + 1n;

    while (x1 < x0) {
      x0 = x1;
      x1 = (x0 + value / x0) / 2n;
    }

    return x0;
  }
}

// Main
async function main() {
  console.log(`
╔══════════════════════════════════════════════════╗
║   Standalone LP Deployer Service                 ║
║   Monitors and deploys liquidity pools           ║
╚══════════════════════════════════════════════════╝
`);

  const deployer = new StandaloneLPDeployer();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n\n🛑 Shutting down...');
    deployer.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n\n🛑 Shutting down...');
    deployer.stop();
    process.exit(0);
  });

  await deployer.start();
}

main().catch(console.error);

