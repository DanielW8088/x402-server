import { PublicClient } from "viem";

export type NonceSyncStrategy = 'always' | 'once';

/**
 * Nonce Manager for safe serial transaction handling
 * Manages nonce state for a single wallet to prevent conflicts
 * Designed for SERIAL processing (one tx at a time)
 * 
 * Two strategies:
 * - 'always': Sync from chain before EVERY transaction (safe, for low-frequency ops like Deploy)
 * - 'once': Sync only on init and after failures (fast, for high-frequency ops like Mint)
 */
export class NonceManager {
  private currentNonce: bigint | null = null;
  private lastUsedNonce: bigint | null = null;
  private readonly walletAddress: `0x${string}`;
  private readonly publicClient: PublicClient;
  private syncInProgress: boolean = false;
  private readonly syncStrategy: NonceSyncStrategy;

  constructor(
    walletAddress: `0x${string}`, 
    publicClient: PublicClient,
    syncStrategy: NonceSyncStrategy = 'always'
  ) {
    this.walletAddress = walletAddress;
    this.publicClient = publicClient as any;
    this.syncStrategy = syncStrategy;
  }

  /**
   * Initialize nonce from chain
   */
  async initialize(): Promise<void> {
    await this.syncFromChain();
    console.log(`✅ NonceManager initialized for ${this.walletAddress}, starting nonce: ${this.currentNonce}, strategy: ${this.syncStrategy}`);
  }

  /**
   * Sync nonce from chain
   * Uses 'pending' block to include pending transactions in nonce calculation
   * This prevents nonce conflicts when processing in parallel batches
   */
  async syncFromChain(): Promise<void> {
    if (this.syncInProgress) {
      // Wait for ongoing sync
      while (this.syncInProgress) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      return;
    }

    this.syncInProgress = true;
    try {
      // Use 'pending' to include pending transactions
      // This gives us the next available nonce even if previous txs are still pending
      const nonce = await this.publicClient.getTransactionCount({
        address: this.walletAddress,
        blockTag: 'pending',
      });
      
      this.currentNonce = BigInt(nonce);
      console.log(`🔄 Synced nonce from chain: ${this.currentNonce} (pending)`);
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Get next available nonce for serial transaction processing
   * Behavior depends on syncStrategy:
   * - 'always': Syncs from chain before EVERY nonce (safe for low-frequency ops)
   * - 'once': Only syncs on init or after failures (fast for high-frequency ops)
   */
  async getNextNonce(): Promise<number> {
    if (this.syncStrategy === 'always') {
      // SAFE MODE: Always sync from chain before getting next nonce
      // This ensures we have the most up-to-date nonce, even if other
      // processes or operations have used this wallet
      await this.syncFromChain();
      console.log(`➡️  Assigned nonce: ${this.currentNonce} (synced from chain)`);
    } else {
      // FAST MODE: Only sync on first call or after failure
      if (this.currentNonce === null) {
        await this.initialize();
      }
      console.log(`➡️  Assigned nonce: ${this.currentNonce} (cached)`);
    }

    const nonce = this.currentNonce!;
    this.lastUsedNonce = nonce;
    this.currentNonce = nonce + 1n;

    return Number(nonce);
  }

  /**
   * Mark nonce as confirmed (transaction succeeded)
   * No action needed for serial processing, nonce already incremented
   */
  confirmNonce(nonce: number): void {
    console.log(`✅ Confirmed nonce: ${nonce}`);
    // For serial processing, no action needed
  }

  /**
   * Handle failed transaction - resync from chain to get accurate state
   * Critical for recovering from failed transactions
   */
  async handleFailedNonce(nonce: number): Promise<void> {
    console.log(`⚠️  Failed nonce: ${nonce}, resyncing from chain...`);
    
    // Resync from chain to get accurate state
    // This ensures we don't skip nonces or reuse failed ones
    await this.syncFromChain();
  }

  /**
   * Get current nonce state (for debugging)
   */
  getState() {
    return {
      currentNonce: this.currentNonce?.toString(),
      lastUsedNonce: this.lastUsedNonce?.toString(),
    };
  }
}

