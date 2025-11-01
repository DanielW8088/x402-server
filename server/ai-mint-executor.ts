#!/usr/bin/env node
/**
 * AI Mint Executor Service v1.0
 * 
 * Monitors database for funded AI agent tasks and automatically mints tokens
 * 
 * Features:
 * - Automatic batch mint execution (prefers 10x, max 1000x)
 * - Interval-based minting to avoid spam
 * - Wallet management per user
 * - Error handling and retry logic
 * 
 * Run independently from the main server
 */

import { Pool } from "pg";
import { createPublicClient, createWalletClient, http, parseAbi, formatUnits, parseUnits, encodePacked, keccak256, hexToBytes, bytesToHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";
import * as dotenv from "dotenv";
import { createRPCBalancer } from "./lib/rpc-balancer.js";
import { resolve } from "path";
import { decryptPrivateKey } from "./lib/encryption.js";
import crypto from "crypto";
import { generateMintTxHash } from "./lib/helpers.js";
import type { Account, PrivateKeyAccount } from "viem";
import { aiAgentPrivateKey } from "./config/env.js";

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env') });

// ==================== Constants ====================

const MINT_INTERVAL = 5000; // 5 seconds between mints
const CHECK_INTERVAL = 10000; // 10 seconds to check for new tasks
const MAX_BATCH_SIZE = 10; // Max 10 mints per batch
const MIN_BATCH_SIZE = 1; // Min 1 mint per batch
const MAX_RETRY_COUNT = 3; // Max 3 retries before marking as failed

// ==================== ABIs ====================

const tokenAbi = parseAbi([
  "function mint(address to, bytes32 txHash) external",
  "function batchMint(address[] memory to, bytes32[] memory txHashes) external",
  "function paymentToken() view returns (address)",
  "function pricePerMint() view returns (uint256)",
  "function mintCount() view returns (uint256)",
  "function maxMintCount() view returns (uint256)",
  "function MINT_AMOUNT() view returns (uint256)",
]);

const usdcAbi = parseAbi([
  'function transferFrom(address from, address to, uint256 amount) external returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
  // EIP-3009 gasless transfer
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external',
  'function authorizationState(address authorizer, bytes32 nonce) view returns (bool)',
]);

// ==================== Interfaces ====================

interface MintTask {
  id: string;
  userAddress: string;
  agentWalletId: string;
  tokenAddress: string;
  quantity: number;
  pricePerMint: bigint;
  totalCost: bigint;
  status: string;
  mintsCompleted: number;
  mintsFailed: number;
  fundingTxHash?: string;
  retryCount?: number;
}

interface AgentWallet {
  id: string;
  agentAddress: string;
  encryptedPrivateKey: string;
  usdcBalance: bigint;
}

// ==================== Helper Functions ====================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate EIP-3009 authorization signature for USDC transfer
 */
async function generateEIP3009Authorization(
  from: `0x${string}`,
  to: `0x${string}`,
  value: bigint,
  validAfter: bigint,
  validBefore: bigint,
  nonce: `0x${string}`,
  account: PrivateKeyAccount,
  usdcAddress: `0x${string}`,
  chainId: number,
  network: string
): Promise<{ v: number; r: `0x${string}`; s: `0x${string}` }> {
  // EIP-712 domain
  // CRITICAL: Base Sepolia USDC name is "USDC", Base Mainnet is "USD Coin"
  const usdcName = network === 'base-sepolia' ? 'USDC' : 'USD Coin';
  const domain = {
    name: usdcName,
    version: '2',
    chainId,
    verifyingContract: usdcAddress,
  };

  // EIP-712 type
  const types = {
    TransferWithAuthorization: [
      { name: 'from', type: 'address' },
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'validAfter', type: 'uint256' },
      { name: 'validBefore', type: 'uint256' },
      { name: 'nonce', type: 'bytes32' },
    ],
  };

  // Message
  const message = {
    from,
    to,
    value,
    validAfter,
    validBefore,
    nonce,
  };

  // Sign using EIP-712
  const signature = await account.signTypedData({
    domain,
    types,
    primaryType: 'TransferWithAuthorization',
    message,
  });

  // Parse signature
  const sig = signature.slice(2);
  const r = `0x${sig.slice(0, 64)}` as `0x${string}`;
  const s = `0x${sig.slice(64, 128)}` as `0x${string}`;
  const v = parseInt(sig.slice(128, 130), 16);

  return { v, r, s };
}

// ==================== Main Class ====================

class AIMintExecutor {
  private pool: Pool;
  private publicClient: any;
  private network: string;
  private processingTasks: Set<string> = new Set();
  private isProcessing: boolean = false;
  private monitorInterval: NodeJS.Timeout | null = null;
  private usdcAddress: `0x${string}`;
  private aiAgentAccount: PrivateKeyAccount;
  private serverUrl: string;

  constructor() {
    // Validate environment variables
    const missingVars: string[] = [];
    if (!process.env.DATABASE_URL) missingVars.push("DATABASE_URL");

    if (missingVars.length > 0) {
      console.error("\n❌ Missing required environment variables:");
      missingVars.forEach(v => console.error(`   - ${v}`));
      console.error("\n💡 To fix:");
      console.error("   1. Create .env file: cp env.multi-token.example .env");
      console.error("   2. Set all required variables\n");
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

    // USDC address
    this.usdcAddress = (this.network === "base"
      ? "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
      : "0x036CbD53842c5426634e7929541eC2318f3dCF7e") as `0x${string}`;

    // RPC Load Balancer
    const rpcBalancer = createRPCBalancer(
      this.network === "base"
        ? process.env.BASE_RPC_URL
        : process.env.BASE_SEPOLIA_RPC_URL,
      this.network === "base"
        ? "https://mainnet.base.org"
        : "https://sepolia.base.org"
    );

    // Create clients
    const publicTransport = rpcBalancer.createTransport({
      timeout: 30000,
      retryCount: 3,
      retryDelay: 1000,
    });

    this.publicClient = createPublicClient({
      chain,
      transport: publicTransport,
    });

    // Create AI Agent account for submitting transactions
    this.aiAgentAccount = privateKeyToAccount(aiAgentPrivateKey);

    // Server URL for API calls
    this.serverUrl = process.env.SERVER_URL || "http://localhost:3000";

    console.log(`╔════════════════════════════════════════════════════════════╗`);
    console.log(`║          AI Mint Executor v1.0 Initialized               ║`);
    console.log(`╚════════════════════════════════════════════════════════════╝`);
    console.log(`\n🔧 Configuration:`);
    console.log(`   Network: ${this.network}`);
    console.log(`   Server URL: ${this.serverUrl}`);
    console.log(`   RPC Endpoints: ${rpcBalancer.getStatus().totalUrls}`);
    rpcBalancer.getUrls().forEach((url, i) => {
      console.log(`      ${i + 1}. ${url}`);
    });
    console.log(`   AI Agent Account: ${this.aiAgentAccount.address}`);
    console.log(`   USDC: ${this.usdcAddress}`);
    console.log(`   Mint Interval: ${MINT_INTERVAL / 1000}s`);
    console.log(`   Check Interval: ${CHECK_INTERVAL / 1000}s`);
  }

  async start() {
    console.log(`\n🚀 Starting AI Mint Executor...`);
    console.log(`   Monitoring for funded tasks...\n`);

    // Initial check
    await this.checkAndProcessTasks();

    // Start monitoring
    this.monitorInterval = setInterval(() => {
      this.checkAndProcessTasks();
    }, CHECK_INTERVAL);
  }

  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      console.log("🛑 AI Mint Executor stopped");
    }
  }

  private async checkAndProcessTasks() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      // Query funded tasks or processing tasks that haven't exceeded retry limit
      // Also query pending_payment tasks to auto-fund if balance is sufficient
      const result = await this.pool.query(
        `SELECT t.*, w.agent_address, w.encrypted_private_key, w.usdc_balance
         FROM ai_agent_tasks t
         JOIN ai_agent_wallets w ON t.agent_wallet_id = w.id
         WHERE (
           t.status = 'funded' 
           OR (t.status = 'processing' AND t.mints_completed < t.quantity)
           OR t.status = 'pending_payment'
         )
           AND COALESCE(t.retry_count, 0) < $1
         ORDER BY t.created_at ASC
         LIMIT 20`,
        [MAX_RETRY_COUNT]
      );

      if (result.rows.length === 0) return;

      console.log(`\n🔍 Found ${result.rows.length} task(s) to check...`);

      for (const row of result.rows) {
        try {
          const task: MintTask = {
            id: row.id,
            userAddress: row.user_address,
            agentWalletId: row.agent_wallet_id,
            tokenAddress: row.token_address,
            quantity: row.quantity,
            pricePerMint: BigInt(row.price_per_mint),
            totalCost: BigInt(row.total_cost),
            status: row.status,
            mintsCompleted: row.mints_completed,
            mintsFailed: row.mints_failed,
            fundingTxHash: row.funding_tx_hash,
            retryCount: row.retry_count || 0,
          };

          const wallet: AgentWallet = {
            id: row.agent_wallet_id,
            agentAddress: row.agent_address,
            encryptedPrivateKey: row.encrypted_private_key,
            usdcBalance: BigInt(row.usdc_balance || 0),
          };

          // If task is pending_payment, check if wallet has sufficient balance
          if (task.status === 'pending_payment') {
            console.log(`\n💰 Checking pending_payment task ${task.id.slice(0, 8)}...`);
            
            // Update wallet balance from chain
            const currentBalance = await this.publicClient.readContract({
              address: this.usdcAddress,
              abi: usdcAbi,
              functionName: 'balanceOf',
              args: [wallet.agentAddress as `0x${string}`],
            });

            console.log(`   Agent wallet balance: ${formatUnits(currentBalance, 6)} USDC`);
            console.log(`   Required: ${formatUnits(task.totalCost, 6)} USDC`);

            // Update database balance
            await this.pool.query(
              `UPDATE ai_agent_wallets
               SET usdc_balance = $1, last_balance_check = NOW()
               WHERE id = $2`,
              [currentBalance.toString(), wallet.id]
            );

            wallet.usdcBalance = currentBalance;

            // If sufficient balance, auto-fund the task
            if (currentBalance >= task.totalCost) {
              console.log(`   ✅ Sufficient balance! Auto-funding task...`);
              
              await this.pool.query(
                `UPDATE ai_agent_tasks 
                 SET status = 'funded', funding_tx_hash = 'auto_funded'
                 WHERE id = $1`,
                [task.id]
              );

              task.status = 'funded';
              console.log(`   ✅ Task auto-funded successfully`);
            } else {
              console.log(`   ⏳ Insufficient balance, skipping...`);
              continue;
            }
          }

          // Process funded or processing tasks
          if (task.status === 'funded' || task.status === 'processing') {
            await this.processTask(task, wallet);
          }

          // Wait between tasks to avoid spam
          await sleep(1000);
        } catch (error: any) {
          console.error(`   ❌ Error processing task:`, error.message);
        }
      }
    } catch (error: any) {
      console.error("❌ Monitor error:", error.message);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processTask(task: MintTask, wallet: AgentWallet) {
    const key = task.id;
    if (this.processingTasks.has(key)) {
      console.log(`   ⏭️  Task ${task.id.slice(0, 8)}: Already processing, skipping...`);
      return;
    }

    this.processingTasks.add(key);

    try {
      console.log(`\n╔════════════════════════════════════════════════════════════╗`);
      console.log(`║  Processing Task: ${task.id.slice(0, 8)}...                           ║`);
      console.log(`╚════════════════════════════════════════════════════════════╝`);
      console.log(`   Token: ${task.tokenAddress}`);
      console.log(`   Quantity: ${task.quantity} (${task.mintsCompleted} completed)`);
      console.log(`   Agent Wallet: ${wallet.agentAddress}`);
      console.log(`   Transaction Sender: ${this.aiAgentAccount.address}`);
      console.log(`   Retry Count: ${task.retryCount}/${MAX_RETRY_COUNT}`);

      // Check and update agent wallet USDC balance from chain
      console.log(`   🔍 Checking agent wallet USDC balance...`);
      const currentUsdcBalance = await this.publicClient.readContract({
        address: this.usdcAddress,
        abi: usdcAbi,
        functionName: 'balanceOf',
        args: [wallet.agentAddress as `0x${string}`],
      });

      console.log(`   💰 Agent wallet USDC balance: ${formatUnits(currentUsdcBalance, 6)} USDC`);

      // Update database with current balance
      await this.pool.query(
        `UPDATE ai_agent_wallets
         SET usdc_balance = $1, last_balance_check = NOW()
         WHERE id = $2`,
        [currentUsdcBalance.toString(), wallet.id]
      );

      // Update wallet object with current balance
      wallet.usdcBalance = currentUsdcBalance;

      // Update status to processing
      await this.pool.query(
        `UPDATE ai_agent_tasks SET status = 'processing', started_at = COALESCE(started_at, NOW()) WHERE id = $1`,
        [task.id]
      );

      // Create wallet client for AI Agent (to submit transactions)
      // Use RPC balancer to avoid 401 errors
      const chain = this.network === "base" ? base : baseSepolia;
      const rpcBalancer = createRPCBalancer(
        this.network === "base"
          ? process.env.BASE_RPC_URL
          : process.env.BASE_SEPOLIA_RPC_URL,
        this.network === "base"
          ? "https://mainnet.base.org"
          : "https://sepolia.base.org"
      );
      
      const walletTransport = rpcBalancer.createTransport({
        timeout: 60000,
        retryCount: 3,
        retryDelay: 1000,
      });
      
      const aiAgentWalletClient = createWalletClient({
        account: this.aiAgentAccount,
        chain,
        transport: walletTransport,
      });

      // Get token info from contract and database
      const [paymentToken, mintAmount] = await Promise.all([
        this.publicClient.readContract({
          address: task.tokenAddress as `0x${string}`,
          abi: tokenAbi,
          functionName: 'paymentToken',
        }),
        this.publicClient.readContract({
          address: task.tokenAddress as `0x${string}`,
          abi: tokenAbi,
          functionName: 'MINT_AMOUNT',
        }),
      ]);

      // Get price from database (more reliable than contract)
      const tokenInfo = await this.pool.query(
        'SELECT price FROM deployed_tokens WHERE address = $1',
        [task.tokenAddress.toLowerCase()]
      );

      let pricePerMint: bigint;
      if (tokenInfo.rows.length > 0 && tokenInfo.rows[0].price) {
        // Parse price from database (e.g., "1 USDC" -> 1000000)
        const priceStr = tokenInfo.rows[0].price;
        const priceMatch = priceStr.match(/[\d.]+/);
        if (priceMatch) {
          pricePerMint = parseUnits(priceMatch[0], 6); // 6 decimals for USDC
        } else {
          pricePerMint = parseUnits('1', 6); // Default 1 USDC
        }
      } else {
        // Fallback: use task.pricePerMint from database
        pricePerMint = task.pricePerMint;
      }

      console.log(`   Payment Token: ${paymentToken}`);
      console.log(`   Price per Mint: ${formatUnits(pricePerMint, 6)} USDC`);
      console.log(`   Mint Amount: ${formatUnits(mintAmount, 6)} tokens`);

      // Calculate remaining mints
      const remaining = task.quantity - task.mintsCompleted;
      console.log(`   Remaining: ${remaining} mints`);

      // Check AI Agent Account ETH balance
      const aiAgentEthBalance = await this.publicClient.getBalance({
        address: this.aiAgentAccount.address,
      });
      
      console.log(`   AI Agent Account ETH: ${formatUnits(aiAgentEthBalance, 18)} ETH`);
      
      if (aiAgentEthBalance < parseUnits('0.001', 18)) {
        throw new Error(`AI Agent Account ETH balance too low: ${formatUnits(aiAgentEthBalance, 18)} ETH. Need at least 0.001 ETH.`);
      }

      // Execute mints in batches
      let completed = task.mintsCompleted;
      let failed = task.mintsFailed;

      
      // Get chain ID for EIP-3009
      const chainId = this.network === "base" ? 8453 : 84532;

      // Decrypt agent wallet private key (once, outside loop)
      const agentPrivateKey = decryptPrivateKey(wallet.encryptedPrivateKey);
      const agentAccount = privateKeyToAccount(agentPrivateKey);
      
      // Create wallet client transport for agent
      const agentWalletTransport = rpcBalancer.createTransport({
        timeout: 30000,
        retryCount: 3,
        retryDelay: 1000,
      });
      
      const agentWalletClient = createWalletClient({
        account: agentAccount,
        chain,
        transport: agentWalletTransport,
      });

      while (completed < task.quantity) {
        const batchSize = Math.min(MAX_BATCH_SIZE, task.quantity - completed);
        console.log(`\n   🎯 Minting batch of ${batchSize}...`);

        try {
          // Batch mint optimization: authorize total amount and call API once per batch
          const batchTotalCost = pricePerMint * BigInt(batchSize);
          
          console.log(`   💰 Batch cost: ${formatUnits(batchTotalCost, 6)} USDC (${formatUnits(pricePerMint, 6)} × ${batchSize})`);

          // 1. Generate EIP-3009 authorization for the entire batch
          const nonce = `0x${crypto.randomBytes(32).toString('hex')}` as `0x${string}`;
          const validAfter = BigInt(0);
          const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600); // Valid for 1 hour

          // USDC domain (EIP-712)
          const usdcName = this.network === 'base-sepolia' ? 'USDC' : 'USD Coin';
          const domain = {
            name: usdcName,
            version: '2',
            chainId,
            verifyingContract: this.usdcAddress,
          };

          // EIP-712 typed data
          const types = {
            TransferWithAuthorization: [
              { name: 'from', type: 'address' },
              { name: 'to', type: 'address' },
              { name: 'value', type: 'uint256' },
              { name: 'validAfter', type: 'uint256' },
              { name: 'validBefore', type: 'uint256' },
              { name: 'nonce', type: 'bytes32' },
            ],
          };

          const message = {
            from: wallet.agentAddress as `0x${string}`,
            to: task.tokenAddress as `0x${string}`, // Transfer USDC to token contract
            value: batchTotalCost, // Total cost for batch
            validAfter,
            validBefore,
            nonce,
          };

          // Sign typed data
          const signature = await agentWalletClient.signTypedData({
            account: agentAccount,
            domain,
            types,
            primaryType: 'TransferWithAuthorization',
            message,
          });

          // Create authorization object
          const authorization = {
            from: wallet.agentAddress,
            to: task.tokenAddress,
            value: batchTotalCost.toString(), // Total cost for batch
            validAfter: validAfter.toString(),
            validBefore: validBefore.toString(),
            nonce,
            signature,
          };

          console.log(`   🔐 Authorization created for batch, calling API...`);

          // 2. Call mint API once with batch quantity (with timeout)
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 second timeout for batch

          try {
            const response = await fetch(`${this.serverUrl}/api/mint/${task.tokenAddress}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                authorization,
                recipient: task.userAddress, // Tokens go to USER, not agent
                quantity: batchSize, // Batch size instead of 1
              }),
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
              const errorData: any = await response.json().catch(() => ({ message: 'Unknown error' }));
              throw new Error(errorData.message || `API error: ${response.status}`);
            }

            const result = await response.json();
            console.log(`   ✅ Batch of ${batchSize} mints queued successfully`);
            console.log(`   📋 Queue IDs: ${result.queueIds ? result.queueIds.slice(0, 3).join(', ') + '...' : result.queueId || 'N/A'}`);

            completed += batchSize;

            // Update progress
            await this.pool.query(
              `UPDATE ai_agent_tasks SET mints_completed = $1 WHERE id = $2`,
              [completed, task.id]
            );

            // Wait between batches
            if (completed < task.quantity) {
              await sleep(MINT_INTERVAL);
            }
          } catch (fetchError: any) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
              throw new Error('Mint API request timeout (120s)');
            }
            throw fetchError;
          }
        } catch (error: any) {
          console.error(`   ❌ Batch failed: ${error.message}`);
          
          // If exceeded retry limit, already marked as failed
          if (error.message.includes('Exceeded retry limit')) {
            throw error;
          }
          
          // Otherwise, increment retry count and keep in processing
          const newRetryCount = (task.retryCount || 0) + 1;
          
          if (newRetryCount >= MAX_RETRY_COUNT) {
            console.error(`   🚫 Task exceeded retry limit (${MAX_RETRY_COUNT}). Marking as failed.`);
            await this.pool.query(
              `UPDATE ai_agent_tasks 
               SET status = 'failed', 
                   error_message = $1,
                   retry_count = $2,
                   completed_at = NOW()
               WHERE id = $3`,
              [`Exceeded retry limit after ${MAX_RETRY_COUNT} attempts. Last error: ${error.message.substring(0, 400)}`, newRetryCount, task.id]
            );
          } else {
            // Keep in processing, will retry on next check
            await this.pool.query(
              `UPDATE ai_agent_tasks 
               SET error_message = $1,
                   retry_count = $2
               WHERE id = $3`,
              [`Retry ${newRetryCount}/${MAX_RETRY_COUNT}: ${error.message.substring(0, 400)}`, newRetryCount, task.id]
            );
          }

          throw error;
        }
      }

      // All mints completed
      console.log(`\n   🎉 All ${completed} mints completed!`);

      await this.pool.query(
        `UPDATE ai_agent_tasks 
         SET status = 'completed', 
             mints_completed = $1,
             completed_at = NOW()
         WHERE id = $2`,
        [completed, task.id]
      );

      console.log(`   ✅ Task completed successfully`);

    } catch (error: any) {
      console.error(`\n❌ Task processing failed: ${error.message}`);
      
      await this.pool.query(
        `UPDATE ai_agent_tasks 
         SET status = 'failed', 
             error_message = $1,
             completed_at = NOW()
         WHERE id = $2`,
        [error.message.substring(0, 500), task.id]
      );
    } finally {
      this.processingTasks.delete(key);
    }
  }
}

// ==================== Main ====================

async function main() {
  const executor = new AIMintExecutor();

  // Handle graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n\n🛑 Received SIGINT, shutting down gracefully...");
    executor.stop();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.log("\n\n🛑 Received SIGTERM, shutting down gracefully...");
    executor.stop();
    process.exit(0);
  });

  await executor.start();
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});

