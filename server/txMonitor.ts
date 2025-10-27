import type { PublicClient, WalletClient } from 'viem';

interface PendingTx {
  hash: `0x${string}`;
  submittedAt: number;
  lastGasPrice: bigint;
  nonce: number;
  contractAddress: `0x${string}`;
  functionName: string;
  args: any[];
  gas: bigint;
  gasAttempts: number;
}

/**
 * Transaction Monitor with Automatic Gas Acceleration
 * 
 * Monitors pending transactions and automatically increases gas price
 * if transaction doesn't confirm within threshold time
 */
export class TransactionMonitor {
  private pendingTxs = new Map<string, PendingTx>();
  private monitorInterval: NodeJS.Timeout | null = null;
  private checkIntervalMs = 2000; // Check every 2 seconds
  private gasIncreaseThresholdMs = 5000; // Increase gas after 5 seconds
  private gasIncreaseMultiplier = 1.2; // Increase by 20% each time
  private maxGasAttempts = 5;

  constructor(
    private publicClient: PublicClient,
    private walletClient: WalletClient,
    private abi: any
  ) {}

  /**
   * Start monitoring loop
   */
  start() {
    if (this.monitorInterval) return;
    
    console.log('🔍 Starting transaction monitor...');
    console.log(`   - Check interval: ${this.checkIntervalMs}ms`);
    console.log(`   - Gas increase threshold: ${this.gasIncreaseThresholdMs}ms`);
    console.log(`   - Gas multiplier: ${this.gasIncreaseMultiplier}x`);
    console.log(`   - Max attempts: ${this.maxGasAttempts}`);
    
    this.monitorInterval = setInterval(() => {
      this.checkPendingTransactions();
    }, this.checkIntervalMs);
  }

  /**
   * Stop monitoring loop
   */
  stop() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      console.log('⏹️  Stopped transaction monitor');
    }
  }

  /**
   * Track a new transaction
   */
  trackTransaction(
    hash: `0x${string}`,
    nonce: number,
    gasPrice: bigint,
    gas: bigint,
    contractAddress: `0x${string}`,
    functionName: string,
    args: any[]
  ) {
    this.pendingTxs.set(hash, {
      hash,
      submittedAt: Date.now(),
      lastGasPrice: gasPrice,
      nonce,
      contractAddress,
      functionName,
      args,
      gas,
      gasAttempts: 1,
    });
    console.log(`📍 Tracking tx ${hash.slice(0, 10)}... (nonce: ${nonce}, gas: ${gasPrice.toString()})`);
  }

  /**
   * Check all pending transactions
   */
  private async checkPendingTransactions() {
    if (this.pendingTxs.size === 0) return;

    for (const [hashStr, tx] of this.pendingTxs.entries()) {
      const hash = hashStr as `0x${string}`;
      const timeSinceSubmit = Date.now() - tx.submittedAt;

      try {
        // Check if transaction is confirmed
        const receipt = await this.publicClient.getTransactionReceipt({ hash });
        
        if (receipt) {
          console.log(`✅ Tx ${hash.slice(0, 10)}... confirmed at block ${receipt.blockNumber}`);
          this.pendingTxs.delete(hashStr);
          continue;
        }
      } catch (error) {
        // Transaction not found yet, continue monitoring
      }

      // Check if we should increase gas
      if (
        timeSinceSubmit >= this.gasIncreaseThresholdMs &&
        tx.gasAttempts < this.maxGasAttempts
      ) {
        await this.accelerateTransaction(hash, tx);
      }

      // Check if we should give up (after max attempts and 2 minutes total)
      if (tx.gasAttempts >= this.maxGasAttempts && timeSinceSubmit > 120_000) {
        console.error(`❌ Tx ${hash.slice(0, 10)}... timeout after ${this.maxGasAttempts} gas attempts and ${Math.floor(timeSinceSubmit / 1000)}s`);
        this.pendingTxs.delete(hashStr);
      }
    }
  }

  /**
   * Accelerate transaction by sending replacement with higher gas
   */
  private async accelerateTransaction(oldHash: `0x${string}`, tx: PendingTx) {
    try {
      const newGasPrice = (tx.lastGasPrice * BigInt(Math.floor(this.gasIncreaseMultiplier * 100))) / 100n;
      const increasePercent = ((this.gasIncreaseMultiplier - 1) * 100).toFixed(0);
      
      console.log(`⚡ Accelerating tx (attempt ${tx.gasAttempts + 1}/${this.maxGasAttempts})`);
      console.log(`   Old hash: ${oldHash.slice(0, 10)}...`);
      console.log(`   Old gas:  ${tx.lastGasPrice.toString()}`);
      console.log(`   New gas:  ${newGasPrice.toString()} (+${increasePercent}%)`);

      // Send replacement transaction with same nonce but higher gas
      const newHash = await this.walletClient.writeContract({
        address: tx.contractAddress,
        abi: this.abi,
        functionName: tx.functionName,
        args: tx.args,
        nonce: tx.nonce,
        gasPrice: newGasPrice,
        gas: tx.gas,
      } as any);

      console.log(`✅ Replacement tx sent: ${newHash.slice(0, 10)}...`);

      // Update tracking: remove old, add new
      this.pendingTxs.delete(oldHash);
      this.pendingTxs.set(newHash, {
        ...tx,
        hash: newHash,
        lastGasPrice: newGasPrice,
        gasAttempts: tx.gasAttempts + 1,
        submittedAt: Date.now(), // Reset timer for this attempt
      });
    } catch (error: any) {
      console.error(`❌ Failed to accelerate tx ${oldHash.slice(0, 10)}...:`, error.message);
      
      // Still increment attempts to avoid infinite loop
      tx.gasAttempts++;
      
      // If it's "replacement underpriced", try with even higher gas
      if (error.message?.includes('replacement transaction underpriced')) {
        console.log(`   ⚠️  Replacement underpriced, will try with higher gas next time`);
        // Increase multiplier temporarily for next attempt
        tx.lastGasPrice = (tx.lastGasPrice * 130n) / 100n; // Bump by 30%
      }
    }
  }

  /**
   * Get number of pending transactions
   */
  getPendingCount(): number {
    return this.pendingTxs.size;
  }

  /**
   * Check if a transaction is being monitored
   */
  isPending(hash: `0x${string}`): boolean {
    return this.pendingTxs.has(hash);
  }

  /**
   * Get all pending transactions (for debugging)
   */
  getPendingTransactions(): PendingTx[] {
    return Array.from(this.pendingTxs.values());
  }
}

