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
]);

const positionManagerAbi = parseAbi([
  "function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96) external payable returns (address pool)",
  "function mint((address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address recipient, uint256 deadline)) external payable returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
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
  private checkInterval: number = 15000; // 15 seconds
  private monitorInterval: NodeJS.Timeout | null = null;
  private processingTokens: Set<string> = new Set();
  private isProcessing: boolean = false;

  constructor() {
    // Validate environment variables
    if (!process.env.DATABASE_URL) {
      throw new Error("❌ DATABASE_URL environment variable is required");
    }
    if (!process.env.PRIVATE_KEY) {
      throw new Error("❌ PRIVATE_KEY environment variable is required (for calling transferAssetsForLP)");
    }
    if (!process.env.LP_DEPLOYER_PRIVATE_KEY) {
      throw new Error("❌ LP_DEPLOYER_PRIVATE_KEY environment variable is required (for deploying LP)");
    }

    // Database
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    // Network config
    const network = process.env.NETWORK || "baseSepolia";
    const chain = network === "base" ? base : baseSepolia;
    const rpcUrl = process.env.RPC_URL || (network === "base" 
      ? "https://mainnet.base.org" 
      : "https://sepolia.base.org");

    // Position Manager address
    this.positionManagerAddress = (network === "base"
      ? "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1"
      : "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2") as `0x${string}`;

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
                payment_token_address, lp_deployment_error, 
                lp_deployment_error_at, lp_retry_count
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

          await this.processToken(
            token.address as `0x${string}`,
            token.name,
            token.symbol,
            token.max_mint_count,
            token.pool_fee || 3000,
            token.payment_token_address as `0x${string}`,
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
    retryCount: number = 0
  ) {
    try {
      console.log(`\n💧 Deploying LP for ${symbol} (${tokenAddress})...`);
      console.log(`   Pool config: fee=${poolFee} (${poolFee/10000}%)`);

      const gasPrice = await this.publicClient.getGasPrice();
      const minGasPrice = 100000000n; // 0.1 gwei
      // Use 5x buffer to avoid "replacement transaction underpriced"
      const gasPriceWithBuffer = gasPrice > 0n ? (gasPrice * 500n) / 100n : minGasPrice;
      const finalGasPrice = gasPriceWithBuffer > minGasPrice ? gasPriceWithBuffer : minGasPrice;

      console.log(`   Current gas price: ${gasPrice} wei (${Number(gasPrice) / 1e9} gwei)`);
      console.log(`   Using gas price (5x buffer): ${finalGasPrice} wei (${Number(finalGasPrice) / 1e9} gwei)`);

      const lpDeployerAddress = this.lpWalletClient.account!.address;

      // Step 1: Transfer assets
      console.log(`   📍 Step 1: Transferring assets to LP deployer (${lpDeployerAddress})...`);

      const transferHash = await this.adminWalletClient.writeContract({
        address: tokenAddress,
        abi: tokenAbi,
        functionName: "transferAssetsForLP",
        gas: 300000n,
        gasPrice: finalGasPrice,
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

      if (tokenBalance === 0n || usdcBalance === 0n) {
        throw new Error(`Insufficient balance after transfer: Token=${tokenBalance}, USDC=${usdcBalance}`);
      }

      // Continue with LP deployment
      await this.deployLP(tokenAddress, name, symbol, poolFee, paymentTokenAddress, tokenBalance, usdcBalance, retryCount);

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

      if (tokenBalance === 0n || usdcBalance === 0n) {
        throw new Error(`Insufficient balance: Token=${tokenBalance}, USDC=${usdcBalance}`);
      }

      await this.deployLP(tokenAddress, name, symbol, poolFee, paymentTokenAddress, tokenBalance, usdcBalance, retryCount);

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
    tokenBalance: bigint,
    usdcBalance: bigint,
    retryCount: number
  ) {
    const gasPrice = await this.publicClient.getGasPrice();
    const minGasPrice = 100000000n; // 0.1 gwei
    // Use 5x buffer to avoid "replacement transaction underpriced"
    const gasPriceWithBuffer = gasPrice > 0n ? (gasPrice * 500n) / 100n : minGasPrice;
    const finalGasPrice = gasPriceWithBuffer > minGasPrice ? gasPriceWithBuffer : minGasPrice;

    console.log(`   Current gas price: ${gasPrice} wei (${Number(gasPrice) / 1e9} gwei)`);
    console.log(`   Using gas price (5x buffer): ${finalGasPrice} wei (${Number(finalGasPrice) / 1e9} gwei)`);

    const lpDeployerAddress = this.lpWalletClient.account!.address;

    // Step 1: Create and initialize pool
    console.log(`   📍 Step 1: Creating/initializing Uniswap V3 pool...`);

    const [token0, token1] = paymentTokenAddress < tokenAddress
      ? [paymentTokenAddress, tokenAddress]
      : [tokenAddress, paymentTokenAddress];

    const [balance0, balance1] = paymentTokenAddress < tokenAddress
      ? [usdcBalance, tokenBalance]
      : [tokenBalance, usdcBalance];

    // Calculate sqrtPriceX96
    const priceScaled = (balance1 * (2n ** 192n)) / balance0;
    const sqrtPriceX96 = this.sqrt(priceScaled);

    console.log(`   💱 Price calculation:`);
    console.log(`      balance0 (${token0}): ${balance0.toString()}`);
    console.log(`      balance1 (${token1}): ${balance1.toString()}`);
    console.log(`      sqrtPriceX96: ${sqrtPriceX96.toString()}`);

    try {
      const poolHash = await this.lpWalletClient.writeContract({
        address: this.positionManagerAddress,
        abi: positionManagerAbi,
        functionName: "createAndInitializePoolIfNecessary",
        args: [token0, token1, poolFee, sqrtPriceX96],
        gas: 500000n,
        gasPrice: finalGasPrice,
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
        console.log(`   ℹ️  Pool already initialized`);
      } else {
        console.log(`   ⚠️  Pool init warning: ${poolError.message}`);
      }
    }

    // Step 2: Approve tokens
    console.log(`   📍 Step 2: Approving tokens...`);

    const [amount0, amount1] = paymentTokenAddress < tokenAddress
      ? [usdcBalance, tokenBalance]
      : [tokenBalance, usdcBalance];

    // Approve token0 with explicit nonce
    console.log(`   ⏳ Approving ${token0}...`);
    const approve0Hash = await this.lpWalletClient.writeContract({
      address: token0,
      abi: erc20Abi,
      functionName: "approve",
      args: [this.positionManagerAddress, amount0],
      gas: 100000n,
      gasPrice: finalGasPrice,
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
      gasPrice: finalGasPrice,
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

    const tickLower = -887220;
    const tickUpper = 887220;

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

    const mintHash = await this.lpWalletClient.writeContract({
      address: this.positionManagerAddress,
      abi: positionManagerAbi,
      functionName: "mint",
      args: [mintParams],
      gas: 1000000n,
      gasPrice: finalGasPrice,
    } as any);

    console.log(`   ⏳ Waiting for LP position mint: ${mintHash}`);
    const mintReceipt = await this.publicClient.waitForTransactionReceipt({
      hash: mintHash,
      confirmations: 1,
    });

    if (mintReceipt.status !== "success") {
      throw new Error(`LP mint failed: ${mintHash}`);
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

