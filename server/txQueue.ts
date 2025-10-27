import { EventEmitter } from 'events';

export interface MintRequest {
  id: string;
  authorization: any;
  timestamp: number;
  retries: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  txHash?: string;
  mintTxHash?: string;
  error?: string;
  result?: any;
}

/**
 * Transaction Queue System
 * Manages concurrent mint requests with retry logic
 */
export class TransactionQueue extends EventEmitter {
  private queue: MintRequest[] = [];
  private processing = false;
  private maxRetries = 3;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.startCleanup();
  }

  /**
   * Add a new mint request to the queue
   */
  addRequest(authorization: any): string {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const request: MintRequest = {
      id,
      authorization,
      timestamp: Date.now(),
      retries: 0,
      status: 'pending',
    };
    
    this.queue.push(request);
    console.log(`📥 Added request ${id} to queue (position: ${this.queue.length})`);
    
    // Start processing if not already running
    if (!this.processing) {
      this.processQueue();
    }
    
    return id;
  }

  /**
   * Get status of a specific request
   */
  getStatus(id: string): MintRequest | undefined {
    return this.queue.find(r => r.id === id);
  }

  /**
   * Get number of pending requests
   */
  getQueueLength(): number {
    return this.queue.filter(r => r.status === 'pending').length;
  }

  /**
   * Get current queue position for a request
   */
  getPosition(id: string): number {
    const pendingRequests = this.queue.filter(r => r.status === 'pending');
    const position = pendingRequests.findIndex(r => r.id === id);
    return position >= 0 ? position + 1 : 0;
  }

  /**
   * Process queue sequentially
   */
  private async processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const request = this.queue.find(r => r.status === 'pending');
      if (!request) break;

      request.status = 'processing';
      console.log(`⚙️  Processing request ${request.id} (queue: ${this.getQueueLength()} pending)...`);

      try {
        // Emit event to process this request
        const result = await new Promise((resolve, reject) => {
          this.emit('process', request, resolve, reject);
        });

        request.status = 'completed';
        request.result = result;
        console.log(`✅ Request ${request.id} completed`);
      } catch (error: any) {
        request.retries++;
        console.error(`❌ Request ${request.id} failed (attempt ${request.retries}/${this.maxRetries}):`, error.message);
        
        if (request.retries >= this.maxRetries) {
          request.status = 'failed';
          request.error = error.message;
          console.error(`❌ Request ${request.id} permanently failed after ${this.maxRetries} retries`);
        } else {
          request.status = 'pending';
          console.log(`🔄 Request ${request.id} will retry (${request.retries}/${this.maxRetries})`);
          // Add small delay before retry
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    }

    this.processing = false;
  }

  /**
   * Cleanup old completed/failed requests
   */
  private startCleanup() {
    this.cleanupInterval = setInterval(() => {
      const before = this.queue.length;
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      
      this.queue = this.queue.filter(r => 
        (r.status === 'pending' || r.status === 'processing') ||
        (r.timestamp > fiveMinutesAgo)
      );
      
      const removed = before - this.queue.length;
      if (removed > 0) {
        console.log(`🧹 Cleaned up ${removed} old requests from queue`);
      }
    }, 60_000); // Cleanup every minute
  }

  /**
   * Stop the queue
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    console.log('⏹️  Queue stopped');
  }
}

