import { Pool } from "pg";
import { WalletClient, PublicClient, parseAbi } from "viem";

const tokenAbi = parseAbi([
  "function mintCount() view returns (uint256)",
  "function maxMintCount() view returns (uint256)",
  "function liquidityDeployed() view returns (bool)",
  "function deployLiquidityV3(int24 tickLower, int24 tickUpper, uint160 sqrtPriceX96) external returns (uint256 tokenId, uint128 liquidity)",
]);

const positionManagerAbi = parseAbi([
  "function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96) external payable returns (address pool)",
]);

export class LPDeployerMonitor {
  private pool: Pool;
  private walletClient: WalletClient;
  private publicClient: PublicClient;
  private positionManagerAddress: `0x${string}`;
  private isProcessing: boolean = false;
  private checkInterval: number = 15000;
  private monitorInterval: NodeJS.Timeout | null = null;
  private processingTokens: Set<string> = new Set(); // Track tokens being processed

  constructor(
    pool: Pool,
    walletClient: WalletClient,
    publicClient: PublicClient,
    positionManagerAddress: `0x${string}`
  ) {
    this.pool = pool;
    this.walletClient = walletClient;
    this.publicClient = publicClient;
    this.positionManagerAddress = positionManagerAddress;
  }

  async start() {
    console.log(`\n🔍 Starting LP Deployer Monitor V3 (check interval: ${this.checkInterval}ms)`);
    await this.checkAndDeployPendingLPs();
    this.monitorInterval = setInterval(() => {
      this.checkAndDeployPendingLPs();
    }, this.checkInterval);
  }

  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      console.log("🛑 LP Deployer Monitor V3 stopped");
    }
  }

  private async checkAndDeployPendingLPs() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const result = await this.pool.query(
        `SELECT address, name, symbol, max_mint_count, pool_fee, 
                payment_token_address
         FROM deployed_tokens 
         WHERE liquidity_deployed = false 
         AND is_active = true
         ORDER BY created_at ASC`
      );

      if (result.rows.length === 0) return;

      console.log(`\n🔍 Checking ${result.rows.length} token(s) for LP deployment readiness...`);

      for (const token of result.rows) {
        try {
          await this.checkAndDeployLP(
            token.address as `0x${string}`,
            token.name,
            token.symbol,
            token.max_mint_count,
            token.pool_fee || 3000,
            token.payment_token_address as `0x${string}`
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

  private async checkAndDeployLP(
    tokenAddress: `0x${string}`,
    name: string,
    symbol: string,
    maxMintCountDB: number,
    poolFee: number,
    paymentTokenAddress: `0x${string}`
  ) {
    // Skip if already processing this token
    if (this.processingTokens.has(tokenAddress.toLowerCase())) {
      console.log(`   ⏭️  ${symbol}: Already processing, skipping...`);
      return;
    }

    try {
      const [mintCount, maxMintCount, liquidityDeployed] = await Promise.all([
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
          functionName: "liquidityDeployed",
        }),
      ]);

      const mintProgress = Number(mintCount) / Number(maxMintCount) * 100;
      console.log(`   📊 ${symbol}: ${mintCount}/${maxMintCount} mints (${mintProgress.toFixed(1)}%)`);

      if (mintCount >= maxMintCount && !liquidityDeployed) {
        console.log(`\n🎉 ${symbol} is ready for LP deployment!`);
        
        // Mark as processing
        this.processingTokens.add(tokenAddress.toLowerCase());
        
        try {
          await this.deployLP(tokenAddress, name, symbol, poolFee, paymentTokenAddress);
        } finally {
          // Remove from processing set
          this.processingTokens.delete(tokenAddress.toLowerCase());
        }
      }
    } catch (error: any) {
      console.error(`   ❌ Failed to check ${symbol}:`, error.message);
    }
  }

  private async deployLP(
    tokenAddress: `0x${string}`,
    name: string,
    symbol: string,
    poolFee: number,
    paymentTokenAddress: `0x${string}`
  ) {
    try {
      console.log(`\n💧 Deploying LP for ${symbol} (${tokenAddress})...`);
      console.log(`   Pool config: fee=${poolFee} (${poolFee/10000}%)`);

      const gasPrice = await this.publicClient.getGasPrice();
      console.log(`   Current gas price: ${gasPrice} wei (${Number(gasPrice) / 1e9} gwei)`);
      
      // Use 3x buffer with minimum of 0.1 gwei for Base network
      const minGasPrice = 100000000n; // 0.1 gwei minimum
      const gasPriceWithBuffer = gasPrice > 0n 
        ? (gasPrice * 300n) / 100n  // 3x buffer
        : minGasPrice;
      const finalGasPrice = gasPriceWithBuffer > minGasPrice ? gasPriceWithBuffer : minGasPrice;
      
      console.log(`   Using gas price: ${finalGasPrice} wei (${Number(finalGasPrice) / 1e9} gwei)`);

      // Use 1:1 initial price (sqrt(1) * 2^96)
      const sqrtPriceX96 = 79228162514264337593543950336n;

      // Step 1: Create and initialize pool if necessary
      const [token0, token1] = paymentTokenAddress < tokenAddress
        ? [paymentTokenAddress, tokenAddress]
        : [tokenAddress, paymentTokenAddress];

      console.log(`   📍 Step 1: Creating/initializing pool if needed...`);
      console.log(`   Initial price: 1:1 (sqrtPriceX96=${sqrtPriceX96})`);
      try {
        const poolHash = await this.walletClient.writeContract({
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
      } catch (poolError: any) {
        if (poolError.message.includes("Already initialized")) {
          console.log(`   ℹ️  Pool already initialized`);
        } else {
          console.log(`   ⚠️  Pool init warning: ${poolError.message}`);
        }
      }

      // Step 2: Deploy liquidity with full range
      console.log(`   📍 Step 2: Deploying liquidity...`);
      const tickLower = -887220; // Full range for 0.05% fee tier
      const tickUpper = 887220;

      const lpHash = await this.walletClient.writeContract({
        address: tokenAddress,
        abi: tokenAbi,
        functionName: "deployLiquidityV3",
        args: [tickLower, tickUpper, sqrtPriceX96],
        gas: 1000000n,
        gasPrice: finalGasPrice,
      } as any);

      console.log(`   ⏳ Waiting for LP deployment confirmation...`);
      console.log(`   TX: ${lpHash}`);

      const lpReceipt = await this.publicClient.waitForTransactionReceipt({
        hash: lpHash,
        confirmations: 1,
        timeout: 180_000,
      });

      if (lpReceipt.status !== "success") {
        throw new Error(`LP deployment transaction reverted: ${lpHash}`);
      }

      console.log(`   ✅ LP deployed successfully!`);
      console.log(`   Block: ${lpReceipt.blockNumber}`);
      console.log(`   Gas used: ${lpReceipt.gasUsed.toString()}`);

      // Update database
      await this.pool.query(
        `UPDATE deployed_tokens 
         SET liquidity_deployed = true, 
             liquidity_tx_hash = $1,
             liquidity_deployed_at = NOW()
         WHERE address = $2`,
        [lpHash, tokenAddress.toLowerCase()]
      );

      console.log(`   ✅ Database updated`);
      console.log(`\n🎊 LP deployment complete for ${symbol}!\n`);
    } catch (error: any) {
      console.error(`\n❌ LP deployment failed for ${symbol}:`, error.message);
      
      await this.pool.query(
        `UPDATE deployed_tokens 
         SET lp_deployment_error = $1,
             lp_deployment_error_at = NOW()
         WHERE address = $2`,
        [error.message, tokenAddress.toLowerCase()]
      );
    }
  }
}

