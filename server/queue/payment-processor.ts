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
 * Handles USDC payment transactions in parallel batches
 * Pre-assigns nonces to avoid conflicts while maintaining high throughput
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
  private batchIntervalMs: number = 4000; // Process every 4000ms (4 seconds) - give time for tx confirmations
  private batchSize: number = 10; // Number of payments to process in parallel per batch
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
    // Use 'once' strategy for batch payment processing
    // Pre-assigns nonces sequentially, then sends all txs in parallel
    this.nonceManager = new NonceManager(account.address, publicClient, 'once');
    this.onPaymentCompleted = onPaymentCompleted;
  }

  /**
   * Start the payment processor
   */
  async start(): Promise<void> {
    // Initialize nonce manager
    await this.nonceManager.initialize();

    // Get batch settings from database
    try {
      const intervalResult = await this.pool.query(`
        SELECT value FROM system_settings WHERE key = 'payment_batch_interval_ms'
      `);
      if (intervalResult.rows.length > 0) {
        this.batchIntervalMs = parseInt(intervalResult.rows[0].value);
      }

      const sizeResult = await this.pool.query(`
        SELECT value FROM system_settings WHERE key = 'payment_batch_size'
      `);
      if (sizeResult.rows.length > 0) {
        this.batchSize = parseInt(sizeResult.rows[0].value);
      }
    } catch (err) {
      // Use default settings if not found
    }

    // Start processing loop
    this.processingInterval = setInterval(
      () => this.processBatch(),
      this.batchIntervalMs
    );

    console.log(`✅ PaymentQueueProcessor started (batch every ${this.batchIntervalMs}ms, size: ${this.batchSize})`);
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
   * Process a batch of pending payments in parallel
   * Pre-assigns nonces to each payment to avoid conflicts
   */
  private async processBatch(): Promise<void> {
    if (this.isProcessing) {
      return; // Skip if already processing
    }

    this.isProcessing = true;

    try {
      // Get multiple pending payments (oldest first)
      const result = await this.pool.query(
        `SELECT * FROM payment_queue 
         WHERE status = 'pending' 
         ORDER BY created_at ASC 
         LIMIT $1`,
        [this.batchSize]
      );

      if (result.rows.length === 0) {
        return; // No payments to process
      }

      console.log(`🔄 Processing ${result.rows.length} payments in parallel...`);

      // Pre-assign nonces to all payments
      const paymentsWithNonces = result.rows.map(row => ({
        row,
        nonce: this.nonceManager.getNextNonce()
      }));

      // Resolve all nonces (they're returned as promises from getNextNonce)
      const resolvedPayments = await Promise.all(
        paymentsWithNonces.map(async (p) => ({
          row: p.row,
          nonce: await p.nonce
        }))
      );

      // Process all payments in parallel
      const results = await Promise.allSettled(
        resolvedPayments.map(p => this.processPayment(p.row, p.nonce))
      );

      // Log results
      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;
      
      console.log(`✅ Batch complete: ${succeeded} succeeded${failed > 0 ? `, ${failed} failed` : ''}`);
      
      if (failed > 0) {
        // If batch had failures, resync nonce ONCE to recover state
        // This prevents cascading nonce conflicts in subsequent batches
        await this.nonceManager.handleFailedNonce(resolvedPayments[0].nonce);
      }
    } catch (error: any) {
      console.error('❌ Payment batch processing error:', error.message);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a single payment transaction
   * @param row Payment queue item
   * @param preAssignedNonce Pre-assigned nonce for parallel processing
   */
  private async processPayment(row: any, preAssignedNonce: number): Promise<void> {
    const paymentId = row.id;
    const authorization = row.authorization;
    const nonce = preAssignedNonce;

    try {
      // Mark as processing
      await this.pool.query(
        `UPDATE payment_queue SET status = 'processing' WHERE id = $1`,
        [paymentId]
      );

      // Parse signature - handle both x402 format (v,r,s separate) and traditional format (signature string)
      let v: number;
      let r: `0x${string}`;
      let s: `0x${string}`;

      if (authorization.signature) {
        // Traditional EIP-3009 format with signature string
        const sig = authorization.signature.startsWith('0x')
          ? authorization.signature.slice(2)
          : authorization.signature;

        r = `0x${sig.slice(0, 64)}` as `0x${string}`;
        s = `0x${sig.slice(64, 128)}` as `0x${string}`;
        v = parseInt(sig.slice(128, 130), 16);

        if (v === 0 || v === 1) v = v + 27;
      } else if (authorization.v !== undefined && authorization.r && authorization.s) {
        // x402 format with v, r, s as separate fields
        v = authorization.v;
        r = authorization.r;
        s = authorization.s;
      } else {
        throw new Error('Invalid authorization format: missing signature or v/r/s fields');
      }

      // Get gas parameters with higher priority fee for batch processing
      const block = await this.publicClient.getBlock();
      const baseFeePerGas = block.baseFeePerGas || 100000000n;
      
      // Use higher priority fee (0.01 gwei) to ensure txs are picked up quickly
      // Add small random jitter (0-20%) to reduce collision in batch sends
      const basePriorityFee = 10000000n; // 0.01 gwei (10x higher than before)
      const jitter = BigInt(Math.floor(Math.random() * 20)); // 0-19%
      const maxPriorityFeePerGas = basePriorityFee + (basePriorityFee * jitter) / 100n;
      
      const maxFeePerGas = (baseFeePerGas * 120n) / 100n + maxPriorityFeePerGas; // 120% of base + priority

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

      // Wait for confirmation with extended timeout (60 seconds)
      // In high-load scenarios, transactions may take longer to confirm
      let receipt;
      try {
        receipt = await this.publicClient.waitForTransactionReceipt({
          hash: txHash,
          confirmations: 1,
          timeout: 60_000, // 60 seconds (default is ~12 seconds)
        });

        if (receipt.status !== "success") {
          throw new Error("Payment transaction reverted");
        }
      } catch (timeoutError: any) {
        // If timeout, we MUST throw error - cannot proceed without confirmation
        // The tx might be reverted (insufficient balance, etc) and we can't know without receipt
        // Security: Never mark as completed without verified receipt
        if (timeoutError.message?.includes('timeout') || timeoutError.message?.includes('timed out')) {
          console.log(`⚠️  Payment tx confirmation timeout: ${paymentId} (tx: ${txHash})`);
          throw new Error(`Payment confirmation timeout - tx sent but not confirmed: ${txHash}`);
        } else {
          throw timeoutError; // Re-throw non-timeout errors
        }
      }

      // Confirm nonce (only reached if receipt is verified)
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

    } catch (error: any) {
      console.error(`❌ Payment failed: ${paymentId}`, error.message);

      // Don't resync nonce here - handled at batch level to prevent cascading conflicts
      // Individual tx failures don't need immediate resync when processing in parallel batches

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
