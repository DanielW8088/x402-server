/**
 * AI Agent Task Executor
 * Monitors tasks and executes mints automatically
 */

import { Pool } from 'pg';
import { createPublicClient, createWalletClient, http, parseAbi, formatUnits, getAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base, baseSepolia } from 'viem/chains';
import { AIAgentService, MintTask } from '../services/aiAgentService.js';

const USDC_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external',
]);

export class AIAgentTaskExecutor {
  private pool: Pool;
  private aiAgentService: AIAgentService;
  private publicClient: any;
  private network: 'base' | 'base-sepolia';
  private usdcAddress: `0x${string}`;
  private serverUrl: string;
  private isRunning: boolean = false;
  private pollInterval: number = 15000; // Check every 15 seconds

  constructor(
    pool: Pool,
    network: 'base' | 'base-sepolia',
    rpcTransport: any, // Use transport instead of URL
    serverUrl: string
  ) {
    this.pool = pool;
    this.aiAgentService = new AIAgentService(pool);
    this.network = network;
    this.serverUrl = serverUrl;

    const chain = network === 'base-sepolia' ? baseSepolia : base;
    this.publicClient = createPublicClient({
      chain,
      transport: rpcTransport, // Use the provided transport
    });

    // USDC addresses
    this.usdcAddress = network === 'base-sepolia'
      ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
      : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
  }

  /**
   * Start the executor
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  AI Agent Executor already running');
      return;
    }

    this.isRunning = true;
    console.log('🤖 AI Agent Task Executor started');
    console.log(`   Network: ${this.network}`);
    console.log(`   Poll interval: ${this.pollInterval}ms`);

    // Start monitoring loop
    this.monitorLoop();
  }

  /**
   * Stop the executor
   */
  stop(): void {
    this.isRunning = false;
    console.log('🛑 AI Agent Task Executor stopped');
  }

  /**
   * Main monitoring loop
   */
  private async monitorLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        // 1. Check for tasks needing payment verification
        await this.checkPendingPayments();

        // 2. Execute funded tasks
        await this.executeFundedTasks();

        // Wait before next iteration
        await this.sleep(this.pollInterval);
      } catch (error: any) {
        console.error('❌ Error in AI Agent executor loop:', error.message);
        await this.sleep(5000); // Wait 5s on error
      }
    }
  }

  /**
   * Check tasks waiting for payment and verify if USDC received
   */
  private async checkPendingPayments(): Promise<void> {
    const result = await this.pool.query(
      `SELECT t.*, w.agent_address, w.id as wallet_id
       FROM ai_agent_tasks t
       JOIN ai_agent_wallets w ON t.agent_wallet_id = w.id
       WHERE t.status = 'pending_payment'
       ORDER BY t.created_at ASC
       LIMIT 10`
    );

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
          createdAt: row.created_at,
        };

        const agentAddress = row.agent_address as `0x${string}`;

        // Check USDC balance
        const balance = await this.publicClient.readContract({
          address: this.usdcAddress,
          abi: USDC_ABI,
          functionName: 'balanceOf',
          args: [agentAddress],
        }) as bigint;

        console.log(`💰 Task ${task.id.slice(0, 8)}: Agent balance = ${formatUnits(balance, 6)} USDC, need ${formatUnits(task.totalCost, 6)} USDC`);

        // If sufficient balance, mark as funded
        if (balance >= task.totalCost) {
          console.log(`✅ Task ${task.id.slice(0, 8)} funded! Marking as ready to execute`);
          
          await this.aiAgentService.updateTaskStatus(task.id, 'funded', {
            fundingTxHash: 'on-chain-balance-check', // We detected balance but don't have specific tx
          });

          // Update cached balance
          await this.pool.query(
            'UPDATE ai_agent_wallets SET usdc_balance = $1, last_balance_check = NOW() WHERE id = $2',
            [balance.toString(), row.wallet_id]
          );
        }
      } catch (error: any) {
        console.error(`❌ Error checking payment for task ${row.id}:`, error.message);
      }
    }
  }

  /**
   * Execute funded tasks
   */
  private async executeFundedTasks(): Promise<void> {
    const result = await this.pool.query(
      `SELECT t.*, w.agent_address, w.encrypted_private_key
       FROM ai_agent_tasks t
       JOIN ai_agent_wallets w ON t.agent_wallet_id = w.id
       WHERE t.status = 'funded'
       ORDER BY t.created_at ASC
       LIMIT 5` // Process up to 5 tasks concurrently
    );

    const promises = result.rows.map(row => this.executeTask(row));
    await Promise.allSettled(promises);
  }

  /**
   * Execute a single mint task
   */
  private async executeTask(row: any): Promise<void> {
    const taskId = row.id;
    
    try {
      console.log(`🔄 Starting execution for task ${taskId.slice(0, 8)}...`);

      // Mark as processing
      await this.aiAgentService.updateTaskStatus(taskId, 'processing');

      const task: MintTask = {
        id: row.id,
        userAddress: row.user_address,
        agentWalletId: row.agent_wallet_id,
        tokenAddress: row.token_address,
        quantity: row.quantity,
        pricePerMint: BigInt(row.price_per_mint),
        totalCost: BigInt(row.total_cost),
        status: 'processing',
        mintsCompleted: row.mints_completed,
        mintsFailed: row.mints_failed,
        createdAt: row.created_at,
      };

      // Get agent private key
      const privateKey = await this.aiAgentService.getAgentPrivateKey(task.agentWalletId);
      const account = privateKeyToAccount(privateKey);

      console.log(`   Agent wallet: ${account.address}`);
      console.log(`   Token: ${task.tokenAddress}`);
      console.log(`   Quantity: ${task.quantity}`);
      console.log(`   User will receive at: ${task.userAddress}`);

      // Create wallet client
      const chain = this.network === 'base-sepolia' ? baseSepolia : base;
      const walletClient = createWalletClient({
        account,
        chain,
        transport: http(),
      });

      // Execute mints
      let completed = 0;
      let failed = 0;

      for (let i = 0; i < task.quantity; i++) {
        try {
          console.log(`   Mint ${i + 1}/${task.quantity}...`);

          // Create EIP-3009 authorization
          const authorization = await this.createAuthorization(
            walletClient,
            account,
            account.address,
            task.tokenAddress as `0x${string}`,
            task.pricePerMint
          );

          // Call mint API with authorization (with timeout)
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

          try {
            const response = await fetch(`${this.serverUrl}/api/mint/${task.tokenAddress}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                authorization,
                recipient: task.userAddress, // Tokens go to USER, not agent
                quantity: 1,
              }),
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
              const errorData: any = await response.json();
              throw new Error(errorData.message || 'Mint failed');
            }

            completed++;
            console.log(`   ✅ Mint ${i + 1} completed`);

            // Update progress
            await this.aiAgentService.updateTaskStatus(taskId, 'processing', {
              mintsCompleted: completed,
              mintsFailed: failed,
            });

            // Small delay between mints
            if (i < task.quantity - 1) {
              await this.sleep(2000);
            }
          } catch (fetchError: any) {
            clearTimeout(timeoutId);
            if (fetchError.name === 'AbortError') {
              throw new Error('Mint request timeout (60s)');
            }
            throw fetchError;
          }
        } catch (error: any) {
          failed++;
          console.error(`   ❌ Mint ${i + 1} failed:`, error.message);

          await this.aiAgentService.updateTaskStatus(taskId, 'processing', {
            mintsCompleted: completed,
            mintsFailed: failed,
          });
          
          // Continue to next mint even if this one failed
          console.log(`   ⏭️  Continuing to next mint...`);
        }
      }

      // Mark task as completed or failed
      if (completed === task.quantity) {
        console.log(`✅ Task ${taskId.slice(0, 8)} completed successfully! ${completed}/${task.quantity} mints`);
        await this.aiAgentService.updateTaskStatus(taskId, 'completed', {
          mintsCompleted: completed,
          mintsFailed: failed,
        });
      } else if (completed === 0) {
        console.log(`❌ Task ${taskId.slice(0, 8)} completely failed`);
        await this.aiAgentService.updateTaskStatus(taskId, 'failed', {
          mintsCompleted: completed,
          mintsFailed: failed,
          errorMessage: 'All mints failed',
        });
      } else {
        console.log(`⚠️  Task ${taskId.slice(0, 8)} partially completed: ${completed}/${task.quantity}`);
        await this.aiAgentService.updateTaskStatus(taskId, 'completed', {
          mintsCompleted: completed,
          mintsFailed: failed,
          errorMessage: `Partial completion: ${failed} mints failed`,
        });
      }
    } catch (error: any) {
      console.error(`❌ Error executing task ${taskId}:`, error.message);
      await this.aiAgentService.updateTaskStatus(taskId, 'failed', {
        errorMessage: error.message,
      });
    }
  }

  /**
   * Create EIP-3009 authorization for payment
   */
  private async createAuthorization(
    walletClient: any,
    account: any,
    from: `0x${string}`,
    to: `0x${string}`,
    value: bigint
  ): Promise<any> {
    const validAfter = 0n;
    const validBefore = BigInt(Math.floor(Date.now() / 1000) + 3600); // Valid for 1 hour
    const nonce = `0x${Array.from({ length: 64 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('')}` as `0x${string}`;

    // Sign typed data
    const signature = await walletClient.signTypedData({
      account,
      domain: {
        name: 'USD Coin',
        version: '2',
        chainId: this.network === 'base-sepolia' ? 84532 : 8453,
        verifyingContract: this.usdcAddress,
      },
      types: {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      },
      primaryType: 'TransferWithAuthorization',
      message: {
        from,
        to,
        value,
        validAfter,
        validBefore,
        nonce,
      },
    });

    return {
      from,
      to,
      value: value.toString(),
      validAfter: validAfter.toString(),
      validBefore: validBefore.toString(),
      nonce,
      signature,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

