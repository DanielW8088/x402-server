import { Pool } from "pg";
import { WalletClient, PublicClient, parseAbi, getAddress, Chain, Account } from "viem";
import { NonceManager } from "./nonce-manager.js";

const usdcAbi = parseAbi([
  "function transferWithAuthorization(address from, address to, uint256 value, uint256 validAfter, uint256 validBefore, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external",
]);

export interface PaymentQueueItem {
  id: string;
  payment_type: 'deploy' | 'mint';
  token_address?: string;
  authorization: any;
  payer: string;
  amount: string;
  payment_token_address: string;
  metadata?: any; // Additional data (deployment config, mint params, etc.)
  status: 'pending' | 'processing' | 'completed' | 'failed';
  tx_hash?: string;
  error?: string;
  result?: any; // Processing result (deployed token address, mint tx, etc.)
  created_at: Date;
  processed_at?: Date;
}

/**
 * Callback for handling payment completion
 */
export type PaymentCompletedCallback = (item: PaymentQueueItem, txHash: string) => Promise<any>;

/**
 * Payment Queue Processor
 * Handles USDC payment transactions serially to avoid nonce conflicts
 */
export class PaymentQueueProcessor {
  private pool: Pool;
  private walletClient: WalletClient;
  private publicClient: PublicClient;
  private chain: Chain;
  private account: Account;
  private nonceManager: NonceManager;
  private processingInterval: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;
  private batchIntervalSeconds: number = 2; // Process every 2 seconds
  private onPaymentCompleted?: PaymentCompletedCallback;

  constructor(
    pool: Pool,
    walletClient: WalletClient,
    publicClient: PublicClient,
    chain: Chain,
    account: Account,
    onPaymentCompleted?: PaymentCompletedCallback
  ) {
    this.pool = pool;
    this.walletClient = walletClient as any;
    this.publicClient = publicClient as any;
    this.chain = chain;
    this.account = account;
    this.nonceManager = new NonceManager(account.address, publicClient);
    this.onPaymentCompleted = onPaymentCompleted;
  }

  /**
   * Start the payment processor
   */
  async start(): Promise<void> {
    // Initialize nonce manager
    await this.nonceManager.initialize();

    // Get batch interval from database
    try {
      const result = await this.pool.query(`
        SELECT value FROM system_settings WHERE key = 'payment_batch_interval_seconds'
      `);
      if (result.rows.length > 0) {
        this.batchIntervalSeconds = parseInt(result.rows[0].value);
      }
    } catch (err) {
      // Use default interval if setting not found
    }

    // Start processing loop
    this.processingInterval = setInterval(
      () => this.processBatch(),
      this.batchIntervalSeconds * 1000
    );

    console.log(`✅ PaymentQueueProcessor started (batch every ${this.batchIntervalSeconds}s)`);
  }

  /**
   * Stop the payment processor
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  /**
   * Add payment to queue
   */
  async addToQueue(
    paymentType: 'deploy' | 'mint',
    authorization: any,
    payer: string,
    amount: string,
    paymentTokenAddress: string,
    tokenAddress?: string,
    metadata?: any
  ): Promise<string> {
    const result = await this.pool.query(
      `INSERT INTO payment_queue 
       (payment_type, token_address, "authorization", payer, amount, payment_token_address, metadata, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING id`,
      [paymentType, tokenAddress, JSON.stringify(authorization), payer, amount, paymentTokenAddress, metadata ? JSON.stringify(metadata) : null]
    );

    return result.rows[0].id;
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(paymentId: string): Promise<PaymentQueueItem | null> {
    const result = await this.pool.query(
      `SELECT * FROM payment_queue WHERE id = $1`,
      [paymentId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.id,
      payment_type: row.payment_type,
      token_address: row.token_address,
      authorization: row.authorization,
      payer: row.payer,
      amount: row.amount,
      payment_token_address: row.payment_token_address,
      metadata: row.metadata,
      status: row.status,
      tx_hash: row.tx_hash,
      error: row.error,
      result: row.result,
      created_at: row.created_at,
      processed_at: row.processed_at,
    };
  }

  /**
   * Process a batch of pending payments (serially)
   */
  private async processBatch(): Promise<void> {
    if (this.isProcessing) {
      return; // Skip if already processing
    }

    this.isProcessing = true;

    try {
      // Get pending payments (ordered by creation time)
      const result = await this.pool.query(
        `SELECT * FROM payment_queue 
         WHERE status = 'pending' 
         ORDER BY created_at ASC 
         LIMIT 10`
      );

      for (const row of result.rows) {
        await this.processPayment(row);
      }
    } catch (error: any) {
      console.error('❌ Payment batch processing error:', error.message);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single payment transaction
   */
  private async processPayment(row: any): Promise<void> {
    const paymentId = row.id;
    const authorization = row.authorization;

    try {
      // Mark as processing
      await this.pool.query(
        `UPDATE payment_queue SET status = 'processing' WHERE id = $1`,
        [paymentId]
      );

      // Get nonce from manager
      const nonce = await this.nonceManager.getNextNonce();

      // Parse signature
      const sig = authorization.signature.startsWith('0x')
        ? authorization.signature.slice(2)
        : authorization.signature;

      const r = `0x${sig.slice(0, 64)}` as `0x${string}`;
      const s = `0x${sig.slice(64, 128)}` as `0x${string}`;
      let v = parseInt(sig.slice(128, 130), 16);

      if (v === 0 || v === 1) v = v + 27;

      // Get gas parameters
      const block = await this.publicClient.getBlock();
      const baseFeePerGas = block.baseFeePerGas || 100000000n;
      const maxPriorityFeePerGas = 1000000n; // 0.001 gwei
      const maxFeePerGas = (baseFeePerGas * 110n) / 100n + maxPriorityFeePerGas;

      // Execute transferWithAuthorization
      const txHash = await this.walletClient.writeContract({
        address: row.payment_token_address as `0x${string}`,
        abi: usdcAbi,
        functionName: "transferWithAuthorization",
        args: [
          getAddress(authorization.from),
          getAddress(authorization.to),
          BigInt(authorization.value),
          BigInt(authorization.validAfter),
          BigInt(authorization.validBefore),
          authorization.nonce as `0x${string}`,
          v,
          r,
          s,
        ],
        account: this.account,
        chain: this.chain,
        gas: 150000n,
        maxFeePerGas,
        maxPriorityFeePerGas,
        nonce, // Use managed nonce
      });

      // Wait for confirmation
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash: txHash,
        confirmations: 1,
      });

      if (receipt.status !== "success") {
        throw new Error("Payment transaction reverted");
      }

      // Confirm nonce
      this.nonceManager.confirmNonce(nonce);

      // Call completion callback if provided (e.g., trigger deployment)
      let result = null;
      if (this.onPaymentCompleted) {
        try {
          const item: PaymentQueueItem = {
            id: row.id,
            payment_type: row.payment_type,
            token_address: row.token_address,
            authorization: row.authorization,
            payer: row.payer,
            amount: row.amount,
            payment_token_address: row.payment_token_address,
            metadata: row.metadata,
            status: 'completed',
            tx_hash: txHash,
            created_at: row.created_at,
          };
          result = await this.onPaymentCompleted(item, txHash);
        } catch (callbackError: any) {
          console.error(`⚠️  Payment callback failed for ${paymentId}:`, callbackError.message);
          // Don't fail payment if callback fails, just log
        }
      }

      // Mark as completed
      await this.pool.query(
        `UPDATE payment_queue 
         SET status = 'completed', tx_hash = $1, result = $2, processed_at = NOW() 
         WHERE id = $3`,
        [txHash, result ? JSON.stringify(result) : null, paymentId]
      );

      console.log(`✅ Payment processed: ${paymentId} (tx: ${txHash})`);

    } catch (error: any) {
      console.error(`❌ Payment failed: ${paymentId}`, error.message);

      // Handle failed nonce
      const state = this.nonceManager.getState();
      if (state.currentNonce) {
        await this.nonceManager.handleFailedNonce(Number(state.currentNonce) - 1);
      }

      // Mark as failed
      await this.pool.query(
        `UPDATE payment_queue 
         SET status = 'failed', error = $1, processed_at = NOW() 
         WHERE id = $2`,
        [error.message, paymentId]
      );
    }
  }

  /**
   * Get payment queue statistics
   */
  async getStats(): Promise<any> {
    const result = await this.pool.query(`
      SELECT 
        status,
        COUNT(*) as count
      FROM payment_queue
      GROUP BY status
    `);

    const stats: any = {
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
    };

    result.rows.forEach(row => {
      stats[row.status] = parseInt(row.count);
    });

    return {
      ...stats,
      nonceState: this.nonceManager.getState(),
    };
  }
}
