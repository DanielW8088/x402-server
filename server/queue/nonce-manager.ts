import { PublicClient } from "viem";

/**
 * Nonce Manager for safe concurrent transaction handling
 * Manages nonce state for a single wallet to prevent conflicts
 */
export class NonceManager {
  private currentNonce: bigint | null = null;
  private pendingNonces: Set<bigint> = new Set();
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
   * Sync nonce from chain (includes pending transactions)
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
      const nonce = await this.publicClient.getTransactionCount({
        address: this.walletAddress,
        blockTag: 'pending', // Include pending transactions
      });
      
      this.currentNonce = BigInt(nonce);
      this.pendingNonces.clear();
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Get next available nonce
   * Returns the nonce and marks it as pending
   */
  async getNextNonce(): Promise<number> {
    if (this.currentNonce === null) {
      await this.initialize();
    }

    // If too many pending nonces, sync from chain first
    if (this.pendingNonces.size > 10) {
      await this.syncFromChain();
    }

    const nonce = this.currentNonce!;
    this.pendingNonces.add(nonce);
    this.currentNonce = nonce + 1n;

    return Number(nonce);
  }

  /**
   * Mark nonce as confirmed (transaction succeeded)
   */
  confirmNonce(nonce: number): void {
    this.pendingNonces.delete(BigInt(nonce));
  }

  /**
   * Mark nonce as failed and resync from chain
   * Called when a transaction fails or is replaced
   */
  async handleFailedNonce(nonce: number): Promise<void> {
    this.pendingNonces.delete(BigInt(nonce));
    
    // Resync from chain to get accurate state
    await this.syncFromChain();
  }

  /**
   * Get current nonce state (for debugging)
   */
  getState() {
    return {
      currentNonce: this.currentNonce?.toString(),
      pendingCount: this.pendingNonces.size,
      pendingNonces: Array.from(this.pendingNonces).map(n => n.toString()),
    };
  }
}

