#!/usr/bin/env node
/**
 * Standalone LP Deployer Service
 * Monitors database for tokens ready for LP deployment and deploys them
 * Run independently from the main server
 */

import { Pool } from "pg";
import {
  Address,
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  getAddress,
  http,
  parseAbi,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";
import JSBI from "jsbi";
import * as dotenv from "dotenv";
import { TickMath, nearestUsableTick, encodeSqrtRatioX96 } from "@uniswap/v3-sdk";
import { CurrencyAmount, Percent, Token } from "@uniswap/sdk-core";
import { Pool as UniswapPool, Position, V4PositionManager, Actions } from "@uniswap/v4-sdk";

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

// Permit2 approve(token, spender, amount, expiration) minimal
const permit2ApproveAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
    ],
    outputs: [],
  },
] as const;

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
  private poolManagerAddress: `0x${string}`;
  private permit2Address: `0x${string}`;
  private factoryAddress: `0x${string}`;
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
    const rpcUrl =
      process.env.RPC_URL || (network === "base" ? "https://mainnet.base.org" : "https://sepolia.base.org");

    this.factoryAddress = (
      network === "base" ? "0x33128a8fC17869897dcE68Ed026d694621f6FDfD" : "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24"
    ) as `0x${string}`;

    // Position Manager and Factory addresses
    // Source: https://docs.uniswap.org/contracts/v4/deployments
    this.positionManagerAddress = (
      network === "base" ? "0x25d093633990dc94bedeed76c8f3cdaa75f3e7d5" : "0x4b2c77d209d3405f41a037ec6c77f7f5b8e2ca80"
    ) as `0x${string}`;

    this.poolManagerAddress = (
      network === "base" ? "0x498581ff718922c3f8e6a244956af099b2652b2b" : "0x05E73354cFDd6745C338b50BcFDfA3Aa6fA03408"
    ) as `0x${string}`;

    this.permit2Address = (
      network === "base" ? "0x000000000022D473030F116dDEE9F6B43aC78BA3" : "0x000000000022D473030F116dDEE9F6B43aC78BA3"
    ) as `0x${string}`;

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
    await this.deployLP(
      "0x0000000000000000000000000000000000000000" as `0x${string}`,
      "Init",
      "INIT",
      10000,
      "0x0000000000000000000000000000000000000000" as `0x${string}`,
      0n,
      0n,
      0
    );

    // // Start monitoring
    // this.monitorInterval = setInterval(() => {
    //   this.checkAndDeployPendingLPs();
    // }, this.checkInterval);
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
        assetsTransferred = (await this.publicClient.readContract({
          address: tokenAddress,
          abi: tokenAbi,
          functionName: "assetsTransferred",
        })) as boolean;
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

      const mintProgress = (Number(mintCount) / Number(maxMintCount)) * 100;
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
      console.log(`   Pool config: fee=${poolFee} (${poolFee / 10000}%)`);

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
      await new Promise((resolve) => setTimeout(resolve, 3000));

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
      console.log(`   Pool config: fee=${poolFee} (${poolFee / 10000}%)`);

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
    const gasPrice = await this.publicClient.getGasPrice();
    const minGasPrice = 100000000n; // 0.1 gwei

    // Use 5x buffer to avoid "replacement transaction underpriced"
    const gasPriceWithBuffer = gasPrice > 0n ? (gasPrice * 500n) / 100n : minGasPrice;
    const finalGasPrice = gasPriceWithBuffer > minGasPrice ? gasPriceWithBuffer : minGasPrice;

    console.log(`   Current gas price: ${gasPrice} wei (${Number(gasPrice) / 1e9} gwei)`);
    console.log(`   Using gas price (5x buffer): ${finalGasPrice} wei (${Number(finalGasPrice) / 1e9} gwei)`);

    console.log(`   📍 Preparing to deploy LP position for ${symbol}...`);

    // log the pool manager address, position manager address, and permit2 address
    console.log(`   🏦 Pool Manager Address: ${this.poolManagerAddress}`);
    console.log(`   📐 Position Manager Address: ${this.positionManagerAddress}`);
    console.log(`   🔐 Permit2 Address: ${this.permit2Address}`);

    const token0Addr = getAddress(paymentTokenAddress);
    const token1Addr = getAddress(tokenAddress);

    // fetch decimals
    const [dec0, dec1] = await Promise.all([
      this.publicClient.readContract({
        address: token0Addr,
        abi: erc20Abi,
        functionName: "decimals",
      }) as Promise<number>,
      this.publicClient.readContract({
        address: token1Addr,
        abi: erc20Abi,
        functionName: "decimals",
      }) as Promise<number>,
    ]);

    // build SDK Token objects (Base chain id: 8453)
    const T0 = new Token(8453, token0Addr, dec0, "USDC", "USD Coin");
    const T1 = new Token(8453, token1Addr, dec1, symbol, name);

    // sort into currency0/currency1 as required by v4 PoolKey
    const [currency0, currency1, wasT0First] = sortCurrencies(token0Addr, token1Addr);
    const token0IsUSDC = currency0.toLowerCase() === token0Addr.toLowerCase();

    const tickSpacing = spacingForFee(poolFee);
    const hooks = zeroAddress; // no hook

    // compute sqrtPriceX96 using integer ratio—use v3-sdk helper (math is same in v4)
    const sqrtPriceX96 = token0IsUSDC
      ? encodeSqrtRatioX96(JSBI.BigInt(usdcAmount.toString()), JSBI.BigInt(tokenAmount.toString())) // sqrt(token1/token0) with ints
      : encodeSqrtRatioX96(JSBI.BigInt(tokenAmount.toString()), JSBI.BigInt(usdcAmount.toString()));

    // full range ticks aligned to spacing
    const { lower: tickLower, upper: tickUpper } = alignFullRangeTicks(tickSpacing);

    // amounts in "token0/token1" order for the SDK Position
    const amount0Desired = token0IsUSDC ? usdcAmount : tokenAmount;
    const amount1Desired = token0IsUSDC ? tokenAmount : usdcAmount;

    // Construct a Pool & Position (the SDK uses these to compute L and precise amounts)
    const pool = new UniswapPool(
      token0IsUSDC ? T0 : T1,
      token0IsUSDC ? T1 : T0,
      poolFee,
      tickSpacing,
      hooks,
      sqrtPriceX96.toString(),
      "0", // initial liquidity is zero for a new pool
      0 // currentTick unknown; SDK only needs bounds + price for fromAmounts
    );

    const position = Position.fromAmounts({
      pool,
      tickLower,
      tickUpper,
      amount0: amount0Desired.toString(),
      amount1: amount1Desired.toString(),
      useFullPrecision: true,
    });

    // Final amounts the mint will actually consume (after rounding to ticks/price grid)
    const { amount0: mintAmt0, amount1: mintAmt1 } = position.mintAmounts;

    // -------- Permit2 approvals (per docs) --------
    // 1) ERC20 -> Permit2 infinite approval
    const MAX = 2n ** 256n - 1n;
    const MAX160 = 2n ** 160n - 1n;
    const MAX48 = 2n ** 48n - 1n;

    // approve Permit2 as spender on both tokens (if not already)
    const approvals: { token: Address; dec: number; desired: bigint }[] = [
      { token: token0Addr, dec: dec0, desired: BigInt(mintAmt0.toString()) },
      { token: token1Addr, dec: dec1, desired: BigInt(mintAmt1.toString()) },
    ];

    for (const a of approvals) {
      // ERC20 approve to Permit2
      const current = (await this.publicClient.readContract({
        address: a.token,
        abi: erc20Abi,
        functionName: "allowance",
        args: [this.lpWalletClient.account!.address as Address, this.permit2Address],
      })) as bigint;

      if (current < a.desired) {
        await this.lpWalletClient.writeContract({
          address: a.token,
          abi: erc20Abi,
          functionName: "approve",
          args: [this.permit2Address, MAX],
        });
      }

      // Permit2 -> PositionManager unlimited with long expiration
      await this.lpWalletClient.writeContract({
        address: this.permit2Address,
        abi: permit2ApproveAbi,
        functionName: "approve",
        args: [a.token, this.positionManagerAddress, MAX160, MAX48],
      });
    }

    // -------- Build multicall: initializePool + modifyLiquidities(MINT_POSITION + SETTLE_PAIR) --------
    // ABI-encode initializePool call
    const poolKeyTuple = {
      currency0: currency0,
      currency1: currency1,
      fee: poolFee,
      tickSpacing: tickSpacing,
      hooks: hooks,
    } as const;

    // 1) encode initializePool(...)
    // Instead of hand-encoding, use viem's encodeFunctionData twice and pass to multicall.
    const initData = (await this.publicClient.encodeFunctionData({
      abi: positionManagerAbi,
      functionName: "initializePool",
      args: [poolKeyTuple, BigInt(sqrtPriceX96.toString())],
    })) as `0x${string}`;

    // 2) encode modifyLiquidities with actions=[MINT_POSITION, SETTLE_PAIR]
    // Actions enum values are defined by the v4 SDK (and docs page). We'll pack [MINT_POSITION, SETTLE_PAIR].
    // Then params[0] is (poolKey, tickLower, tickUpper, liquidity, amount0Max, amount1Max, recipient, hookData)
    // params[1] is (currency0, currency1).
    const actionsPacked = `0x${Buffer.from([Actions.MINT_POSITION, Actions.SETTLE_PAIR]).toString(
      "hex"
    )}` as `0x${string}`;

    const params0 = await this.publicClient.encodeAbiParameters(
      [
        {
          type: "tuple",
          components: [
            { name: "currency0", type: "address" },
            { name: "currency1", type: "address" },
            { name: "fee", type: "uint24" },
            { name: "tickSpacing", type: "int24" },
            { name: "hooks", type: "address" },
          ],
        },
        { type: "int24" }, // tickLower
        { type: "int24" }, // tickUpper
        { type: "uint256" }, // liquidity
        { type: "uint128" }, // amount0Max
        { type: "uint128" }, // amount1Max
        { type: "address" }, // recipient
        { type: "bytes" }, // hookData
      ],
      [
        poolKeyTuple,
        tickLower,
        tickUpper,
        BigInt(position.liquidity.toString()),
        BigInt(mintAmt0.toString()),
        BigInt(mintAmt1.toString()),
        this.lpWalletClient.account!.address as Address,
        "0x",
      ]
    );

    const params1 = await this.publicClient.encodeAbiParameters(
      [{ type: "address" }, { type: "address" }],
      [currency0, currency1]
    );

    const encodedParamsArray = await this.publicClient.encodeAbiParameters(
      [{ type: "bytes" }, { type: "bytes" }],
      [params0 as `0x${string}`, params1 as `0x${string}`]
    );

    const unlockData = await this.publicClient.encodeAbiParameters(
      [{ type: "bytes" }, { type: "bytes" }],
      [actionsPacked, encodedParamsArray as `0x${string}`]
    );

    const deadline = BigInt((Math.floor(Date.now() / 1000) + 60 * 30).toString()); // 30m buffer

    const modifyData = (await this.publicClient.encodeFunctionData({
      abi: positionManagerAbi,
      functionName: "modifyLiquidities",
      args: [unlockData as `0x${string}`, deadline],
    })) as `0x${string}`;

    // Execute multicall on PositionManager
    const lpHash = await this.lpWalletClient.writeContract({
      address: this.positionManagerAddress,
      abi: positionManagerAbi,
      functionName: "multicall",
      args: [[initData, modifyData]],
      // if either token is native ETH you'd pass `value`, but here both are ERC20
    });

    const lpReceipt = await this.publicClient.waitForTransactionReceipt({ lpHash });

    if (lpReceipt.status !== "success") {
      // Try to get revert reason
      console.error(`   ❌ Add LP Multicall transaction reverted. Receipt:`, JSON.stringify(lpReceipt, null, 2));
      throw new Error(`LP Multicall reverted: ${lpHash}. Check Base Sepolia explorer for details.`);
    }

    console.log(`   ✅ LP position minted successfully!`);
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
  process.on("SIGINT", () => {
    console.log("\n\n🛑 Shutting down...");
    deployer.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n\n🛑 Shutting down...");
    deployer.stop();
    process.exit(0);
  });

  await deployer.start();
}

main().catch(console.error);

// fee -> tickSpacing mapping (v3 default tiers carry over commonly used spacings)
function spacingForFee(fee: number): number {
  if (fee === 100) return 1;
  if (fee === 500) return 10;
  if (fee === 3000) return 60;
  if (fee === 10000) return 200;
  // fallback: conservative
  return 60;
}

function sortCurrencies(a: Address, b: Address): [Address, Address, boolean] {
  const aN = BigInt(a);
  const bN = BigInt(b);
  if (aN < bN) return [a, b, true];
  return [b, a, false];
}

function alignFullRangeTicks(tickSpacing: number): { lower: number; upper: number } {
  // align to spacing and clamp inside min/max
  const minTick = Math.ceil(TickMath.MIN_TICK / tickSpacing) * tickSpacing;
  const maxTick = Math.floor(TickMath.MAX_TICK / tickSpacing) * tickSpacing;
  return { lower: minTick, upper: maxTick };
}
