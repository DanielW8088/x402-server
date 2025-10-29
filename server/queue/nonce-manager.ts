import { PublicClient } from "viem";

/**
 * Nonce Manager for safe serial transaction handling
 * Manages nonce state for a single wallet to prevent conflicts
 * Designed for SERIAL processing (one tx at a time)
 */
export class NonceManager {
  private currentNonce: bigint | null = null;
  private lastUsedNonce: bigint | null = null;
  private readonly walletAddress: `0x${string}`;
  private readonly publicClient: PublicClient;
  private syncInProgress: boolean = false;

  constructor(walletAddress: `0x${string}`, publicClient: PublicClient) {
    this.walletAddress = walletAddress;
    this.publicClient = publicClient as any;
  }

  /**
   * Initialize nonce from chain
   */
  async initialize(): Promise<void> {
    await this.syncFromChain();
    console.log(`✅ NonceManager initialized for ${this.walletAddress}, starting nonce: ${this.currentNonce}`);
  }

  /**
   * Sync nonce from chain
   * Uses 'latest' block to get confirmed nonce, avoiding pending tx issues
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
      // Use 'latest' instead of 'pending' to avoid issues with stuck transactions
      const nonce = await this.publicClient.getTransactionCount({
        address: this.walletAddress,
        blockTag: 'latest',
      });
      
      this.currentNonce = BigInt(nonce);
      console.log(`🔄 Synced nonce from chain: ${this.currentNonce}`);
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Get next available nonce for serial transaction processing
   * Simply returns and increments the current nonce
   */
  async getNextNonce(): Promise<number> {
    if (this.currentNonce === null) {
      await this.initialize();
    }

    const nonce = this.currentNonce!;
    this.lastUsedNonce = nonce;
    this.currentNonce = nonce + 1n;

    console.log(`➡️  Assigned nonce: ${nonce}`);
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

