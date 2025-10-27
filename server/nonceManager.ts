import type { PublicClient } from 'viem';
import { dbUtils } from './db';

/**
 * Nonce Manager with mutex lock to prevent concurrent transactions with same nonce
 */
export class NonceManager {
  private currentNonce: number | null = null;
  private pendingNonces = new Set<number>();
  private locks = new Map<number, Promise<void>>();
  private publicClient: any; // Use any to avoid complex type issues between viem versions
  private address: `0x${string}`;

  constructor(publicClient: PublicClient, address: `0x${string}`) {
    this.publicClient = publicClient;
    this.address = address;
  }

  /**
   * Get the next available nonce with lock
   */
  async acquireNonce(): Promise<{ nonce: number; release: () => void }> {
    let nonce: number;

    // Get next nonce
    if (this.currentNonce === null) {
      // First time - get from chain
      const chainNonce = await this.publicClient.getTransactionCount({
        address: this.address,
        blockTag: 'pending', // Include pending transactions
      });
      this.currentNonce = chainNonce;
      nonce = chainNonce;
    } else {
      // Use incremented nonce
      nonce = this.currentNonce + 1;
    }

    // Check if this nonce is already pending in DB
    while (dbUtils.isNoncePending(nonce) || this.pendingNonces.has(nonce)) {
      console.log(`⏭️  Nonce ${nonce} is pending, trying next...`);
      nonce++;
    }

    // Mark as pending
    this.pendingNonces.add(nonce);
    this.currentNonce = nonce;

    console.log(`🔒 Acquired nonce: ${nonce} (active: ${this.pendingNonces.size})`);

    // Create release function
    const release = () => {
      this.pendingNonces.delete(nonce);
      console.log(`🔓 Released nonce: ${nonce} (active: ${this.pendingNonces.size})`);
    };

    return { nonce, release };
  }

  /**
   * Refresh nonce from chain (call after a transaction is confirmed)
   */
  async refreshNonce(): Promise<void> {
    const chainNonce = await this.publicClient.getTransactionCount({
      address: this.address,
      blockTag: 'pending',
    });
    
    if (chainNonce > (this.currentNonce || 0)) {
      console.log(`🔄 Refreshed nonce from ${this.currentNonce} to ${chainNonce}`);
      this.currentNonce = chainNonce;
    }
  }

  /**
   * Get current nonce without acquiring lock
   */
  getCurrentNonce(): number | null {
    return this.currentNonce;
  }

  /**
   * Get pending nonces count
   */
  getPendingCount(): number {
    return this.pendingNonces.size;
  }
}

