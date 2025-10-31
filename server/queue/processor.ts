import { Pool } from "pg";
import { WalletClient, PublicClient, parseAbi, Account } from "viem";
import { NonceManager } from "./nonce-manager.js";

const tokenAbi = parseAbi([
  "function mint(address to, bytes32 txHash) external",
  "function batchMint(address[] memory to, bytes32[] memory txHashes) public",
  "function hasMinted(bytes32 txHash) view returns (bool)",
  "function mintAmount() view returns (uint256)",
  "function remainingSupply() view returns (uint256)",
]);

interface QueueItem {
  id: string;
  payer_address: string;
  tx_hash_bytes32: string;
  payment_type: string;
  token_address?: string;
  created_at?: Date;
}

export class MintQueueProcessor {
  private pool: Pool;
  private walletClient: WalletClient;
  private publicClient: PublicClient;
  private account: Account;
  private nonceManager: NonceManager;
  private tokenContractAddress: `0x${string}` | null;
  private isProcessing: boolean = false;
  private batchInterval: number = 1500; // 1.5 seconds (ultra high throughput mode)
  private maxBatchSize: number = 400; // 400 per batch (balance between speed and gas)
  private processorInterval: NodeJS.Timeout | null = null;
  
  // Queue status cache to avoid expensive COUNT queries on every poll
  private queueStatusCache: Map<string, { data: any; timestamp: number }> = new Map();
  private cacheTimeout: number = 5000; // Cache for 5 seconds

  constructor(
    pool: Pool,
    walletClient: WalletClient,
    publicClient: PublicClient,
    account: Account,
    tokenContractAddress?: `0x${string}`
  ) {
    this.pool = pool;
    this.walletClient = walletClient;
    this.publicClient = publicClient;
    this.account = account;
    this.tokenContractAddress = tokenContractAddress || null;
    
    // Use 'once' strategy for high-frequency minting operations
    // Only syncs nonce on init and after failures, not before every tx
    this.nonceManager = new NonceManager(account.address, publicClient, 'once');
  }

  /**
   * Start the queue processor
   */
  async start() {
    console.log(`🔄 Starting mint queue processor (batch interval: ${this.batchInterval}ms, max batch: ${this.maxBatchSize})`);
    
    // 🔧 FIX: Reset stuck 'processing' items on startup (from server restart/crash)
    await this.resetStuckItems();
    
    // Initialize nonce manager (using 'once' strategy for performance)
    await this.nonceManager.initialize();
    
    // Load settings from database
    await this.loadSettings();
    
    console.log(`   ⚙️  Loaded from DB: ${this.batchInterval}ms interval, max batch: ${this.maxBatchSize}`);
    
    // Process immediately on start
    await this.processBatch();
    
    // Start recurring process
    this.scheduleNextBatch();
  }

  /**
   * Reset items stuck in 'processing' state back to 'pending'
   * This handles cases where server crashed/restarted during processing
   */
  private async resetStuckItems() {
    try {
      const result = await this.pool.query(
        `UPDATE mint_queue 
         SET status = 'pending', updated_at = NOW()
         WHERE status = 'processing'
         RETURNING id, payer_address, created_at`
      );

      if (result.rows.length > 0) {
        console.log(`   🔄 Reset ${result.rows.length} stuck 'processing' items back to 'pending'`);
        result.rows.slice(0, 3).forEach(row => {
          console.log(`      - ${row.id.slice(0, 8)} (${row.payer_address.slice(0, 8)}...)`);
        });
        if (result.rows.length > 3) {
          console.log(`      ... and ${result.rows.length - 3} more`);
        }
      }
    } catch (error: any) {
      console.error('⚠️  Failed to reset stuck items:', error.message);
      // Don't throw - allow service to start anyway
    }
  }

  /**
   * Schedule next batch (allows dynamic interval changes)
   */
  private scheduleNextBatch() {
    this.processorInterval = setTimeout(async () => {
      // Reload settings before each batch
      const oldInterval = this.batchInterval;
      await this.loadSettings();
      
      if (oldInterval !== this.batchInterval) {
        console.log(`   ⚙️  Interval updated: ${oldInterval}ms → ${this.batchInterval}ms`);
      }
      
      // Process batch
      await this.processBatch();
      
      // Schedule next batch
      this.scheduleNextBatch();
    }, this.batchInterval);
  }

  /**
   * Stop the queue processor
   */
  stop() {
    if (this.processorInterval) {
      clearInterval(this.processorInterval);
      this.processorInterval = null;
      console.log("🛑 Queue processor stopped");
    }
  }

  /**
   * Load settings from database
   */
  private async loadSettings() {
    try {
      const result = await this.pool.query(
        "SELECT key, value FROM system_settings WHERE key IN ($1, $2)",
        ["batch_interval_seconds", "max_batch_size"]
      );

      for (const row of result.rows) {
        if (row.key === "batch_interval_seconds") {
          this.batchInterval = parseInt(row.value) * 1000;
        } else if (row.key === "max_batch_size") {
          this.maxBatchSize = parseInt(row.value);
        }
      }
    } catch (error: any) {
      console.warn("⚠️  Failed to load settings from database:", error.message);
    }
  }

  /**
   * Add item to queue
   */
  async addToQueue(
    payerAddress: string,
    txHashBytes32: string,
    paymentTxHash?: string,
    authorizationData?: any,
    paymentType: string = "x402",
    tokenAddress?: string
  ): Promise<string> {
    const client = await this.pool.connect();
    
    try {
      await client.query("BEGIN");

      // Check if already in queue or history
      const existingQueue = await client.query(
        "SELECT id, status FROM mint_queue WHERE tx_hash_bytes32 = $1",
        [txHashBytes32]
      );

      if (existingQueue.rows.length > 0) {
        const existing = existingQueue.rows[0];
        if (existing.status === "completed") {
          throw new Error("Already minted");
        }
        await client.query("ROLLBACK");
        return existing.id;
      }

      const existingHistory = await client.query(
        "SELECT id FROM mint_history WHERE tx_hash_bytes32 = $1",
        [txHashBytes32]
      );

      if (existingHistory.rows.length > 0) {
        throw new Error("Already minted");
      }

      // Get queue position
      const positionResult = await client.query(
        "SELECT COALESCE(MAX(queue_position), 0) + 1 as position FROM mint_queue WHERE status = 'pending'"
      );
      const queuePosition = positionResult.rows[0].position;

      // Insert into queue with ON CONFLICT to handle rare race conditions
      const result = await client.query(
        `INSERT INTO mint_queue 
        (payer_address, payment_tx_hash, authorization_data, tx_hash_bytes32, token_address, payment_type, queue_position) 
        VALUES ($1, $2, $3, $4, $5, $6, $7) 
        ON CONFLICT (tx_hash_bytes32) DO UPDATE 
          SET updated_at = NOW()
        RETURNING id`,
        [
          payerAddress,
          paymentTxHash,
          authorizationData ? JSON.stringify(authorizationData) : null,
          txHashBytes32,
          tokenAddress || this.tokenContractAddress,
          paymentType,
          queuePosition,
        ]
      );

      await client.query("COMMIT");

      const queueId = result.rows[0].id;
      return queueId;
    } catch (error: any) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Process a batch of pending mints
   * Optimized to keep user's bulk mints together
   */
  async processBatch() {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      // Get pending items with smart selection
      // Strategy: Get up to maxBatchSize items, but if we hit a user with multiple mints,
      // include all their pending mints to keep them together
      const result = await this.pool.query(
        `WITH batch_candidates AS (
          SELECT id, payer_address, tx_hash_bytes32, payment_type, token_address, created_at,
                 ROW_NUMBER() OVER (ORDER BY created_at ASC) as rn
          FROM mint_queue 
          WHERE status = 'pending'
        ),
        selected_payers AS (
          SELECT DISTINCT payer_address, token_address
          FROM batch_candidates
          WHERE rn <= $1
        )
        SELECT bc.id, bc.payer_address, bc.tx_hash_bytes32, bc.payment_type, bc.token_address, bc.created_at
        FROM batch_candidates bc
        INNER JOIN selected_payers sp 
          ON bc.payer_address = sp.payer_address 
          AND (bc.token_address = sp.token_address OR (bc.token_address IS NULL AND sp.token_address IS NULL))
        ORDER BY bc.created_at ASC`,
        [this.maxBatchSize]
      );

      if (result.rows.length === 0) {
        // No pending items
        return;
      }

      console.log(`\n📦 Processing batch of ${result.rows.length} mint(s)...`);

      const items: QueueItem[] = result.rows;

      // Group items by token address
      const itemsByToken = new Map<string, QueueItem[]>();
      for (const item of items) {
        const tokenAddr = item.token_address || this.tokenContractAddress || '';
        if (!itemsByToken.has(tokenAddr)) {
          itemsByToken.set(tokenAddr, []);
        }
        itemsByToken.get(tokenAddr)!.push(item);
      }

      // Process each token group
      for (const [tokenAddr, tokenItems] of itemsByToken.entries()) {
        await this.processBatchForToken(tokenAddr as `0x${string}`, tokenItems);
      }
      
      // Clear cache after batch processing (positions have changed)
      this.clearQueueCache();
    } catch (error: any) {
      console.error("❌ Batch processing error:", error.message);
      // Also clear cache on error to force refresh
      this.clearQueueCache();
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a batch for a specific token
   */
  private async processBatchForToken(tokenAddress: `0x${string}`, items: QueueItem[]) {
    const batchStartTime = Date.now();
    let nonce: number | null = null;
    
    try {
      const addresses: `0x${string}`[] = items.map((item) => item.payer_address as `0x${string}`);
      const txHashes: `0x${string}`[] = items.map((item) => item.tx_hash_bytes32 as `0x${string}`);
      
      console.log(`   ⏱️  [0ms] Starting batch for ${tokenAddress.slice(0, 10)}... (${items.length} items)`);

      // 🔧 OPTIMIZED: Only check on-chain for items that might be duplicates
      // Items are considered risky if:
      // 1. They were created more than 30 seconds ago (could have been sent before restart)
      // 2. This is the first batch after startup (resetStuckItems was called)
      const now = Date.now();
      const thirtySecondsAgo = new Date(now - 30000);
      
      const riskyItems = items.filter((item: any) => 
        item.created_at && new Date(item.created_at) < thirtySecondsAgo
      );
      
      let alreadyMintedItems: QueueItem[] = [];
      
      if (riskyItems.length > 0) {
        console.log(`   🔍 Checking ${riskyItems.length}/${items.length} older items for duplicates...`);
        const checkStartTime = Date.now();
        
        const riskyTxHashes = riskyItems.map((item: any) => item.tx_hash_bytes32 as `0x${string}`);
        const alreadyMintedChecks = await Promise.all(
          riskyTxHashes.map(txHash => 
            this.publicClient.readContract({
              address: tokenAddress,
              abi: tokenAbi,
              functionName: "hasMinted",
              args: [txHash],
            })
          )
        );
        
        console.log(`   ⏱️  [${Date.now() - batchStartTime}ms] hasMinted checks done (took ${Date.now() - checkStartTime}ms)`);
        
        alreadyMintedItems = riskyItems.filter((_, index) => alreadyMintedChecks[index]);
      }

      // Filter out items that are already minted on-chain
      const itemsToProcess = items.filter(item => !alreadyMintedItems.includes(item));

      // Mark already minted items as completed immediately
      if (alreadyMintedItems.length > 0) {
        console.log(`   ⚠️  ${alreadyMintedItems.length} items already minted on-chain, skipping...`);
        
        const client = await this.pool.connect();
        try {
          await client.query("BEGIN");
          
          for (const item of alreadyMintedItems) {
            // Mark as completed in queue
            await client.query(
              `UPDATE mint_queue 
               SET status = 'completed', processed_at = NOW(), updated_at = NOW()
               WHERE id = $1`,
              [item.id]
            );
            
            // Move to history
            await client.query(
              `INSERT INTO mint_history 
               (payer_address, tx_hash_bytes32, token_address, mint_tx_hash, amount, payment_type, completed_at)
               VALUES ($1, $2, $3, $4, $5, $6, NOW())
               ON CONFLICT (tx_hash_bytes32) DO NOTHING`,
              [item.payer_address, item.tx_hash_bytes32, tokenAddress, 'already-minted', '0', item.payment_type]
            );
          }
          
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK");
          console.error(`   ❌ Failed to mark already-minted items:`, err);
        } finally {
          client.release();
        }
      }

      // If all items were already minted, return early
      if (itemsToProcess.length === 0) {
        console.log(`   ✅ All items already minted, skipping batch`);
        return;
      }

      // Continue with remaining items
      const addressesToProcess = itemsToProcess.map((item) => item.payer_address as `0x${string}`);
      const txHashesToProcess = itemsToProcess.map((item) => item.tx_hash_bytes32 as `0x${string}`);

      // Mark as processing
      await this.pool.query(
        `UPDATE mint_queue 
         SET status = 'processing', updated_at = NOW() 
         WHERE id = ANY($1)`,
        [itemsToProcess.map((item) => item.id)]
      );
      
      console.log(`   ⏱️  [${Date.now() - batchStartTime}ms] DB updated to 'processing'`);
      
      // Get nonce for this transaction (using cached nonce for performance)
      nonce = await this.nonceManager.getNextNonce();
      
      console.log(`   ⏱️  [${Date.now() - batchStartTime}ms] Got nonce: ${nonce}`);

      // Check remaining supply
      const supplyCheckStart = Date.now();
      const [remainingSupply, mintAmount] = await Promise.all([
        this.publicClient.readContract({
          address: tokenAddress,
          abi: tokenAbi,
          functionName: "remainingSupply",
        }),
        this.publicClient.readContract({
          address: tokenAddress,
          abi: tokenAbi,
          functionName: "mintAmount",
        }),
      ]);
      
      console.log(`   ⏱️  [${Date.now() - batchStartTime}ms] Supply checked (took ${Date.now() - supplyCheckStart}ms)`);

      const totalRequired = mintAmount * BigInt(itemsToProcess.length);
      if (remainingSupply < totalRequired) {
        throw new Error(`Insufficient supply: need ${totalRequired}, have ${remainingSupply}`);
      }

      // Use EIP-1559 for Base (much cheaper!)
      const gasEstimateStart = Date.now();
      const block = await this.publicClient.getBlock();
      const baseFeePerGas = block.baseFeePerGas || 100000000n; // 0.1 gwei fallback
      
      // Priority fee (miner tip) - Base is cheap, very low tip needed
      const maxPriorityFeePerGas = 1000000n; // 0.001 gwei (省钱模式)
      
      // Max fee = base fee * 1.1 + priority fee (只加 10% buffer，不是 300%)
      const maxFeePerGas = (baseFeePerGas * 110n) / 100n + maxPriorityFeePerGas;

      // Use batchMint for multiple addresses, mint for single address
      let hash: `0x${string}`;
      let gasLimit: bigint;
      
      if (itemsToProcess.length === 1) {
        gasLimit = 150000n; // 降低单个 mint 的 gas limit
        hash = await this.walletClient.writeContract({
          address: tokenAddress,
          abi: tokenAbi,
          functionName: "mint",
          args: [addressesToProcess[0], txHashesToProcess[0]],
          account: this.account,
          gas: gasLimit,
          maxFeePerGas,
          maxPriorityFeePerGas,
          nonce, // Use managed nonce
        } as any);
      } else {
        // 批量更省：基础 100k + 每个地址 50k
        gasLimit = BigInt(100000 + 50000 * itemsToProcess.length);
        hash = await this.walletClient.writeContract({
          address: tokenAddress,
          abi: tokenAbi,
          functionName: "batchMint",
          args: [addressesToProcess, txHashesToProcess],
          account: this.account,
          gas: gasLimit,
          maxFeePerGas,
          maxPriorityFeePerGas,
          nonce, // Use managed nonce
        } as any);
      }

      console.log(`   ✅ Tx sent: ${hash}`);
      console.log(`   ⏱️  [${Date.now() - batchStartTime}ms] Transaction sent (gas estimate took ${Date.now() - gasEstimateStart}ms)`);

      // Record batch mint
      await this.pool.query(
        `INSERT INTO batch_mints (batch_tx_hash, mint_count, status) 
         VALUES ($1, $2, 'pending')`,
        [hash, itemsToProcess.length]
      );

      // Wait for confirmation
      const waitStart = Date.now();
      console.log(`   ⏳ Waiting for confirmation...`);
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 120_000,
      });
      
      console.log(`   ⏱️  [${Date.now() - batchStartTime}ms] Confirmed! (wait took ${Date.now() - waitStart}ms)`);

      // 计算实际成本
      const actualGasUsed = receipt.gasUsed;
      const effectiveGasPrice = receipt.effectiveGasPrice || 0n;
      const actualCostWei = actualGasUsed * effectiveGasPrice;
      const actualCostEth = Number(actualCostWei) / 1e18;
      const actualCostPerUser = actualCostEth / itemsToProcess.length;
      
      console.log(`✅ Confirmed: ${itemsToProcess.length} mints | Cost: ${actualCostEth.toFixed(6)} ETH ($${(actualCostEth * 2500).toFixed(2)}) | Per user: $${(actualCostPerUser * 2500).toFixed(4)}\n`);

      if (receipt.status !== "success") {
        throw new Error(`Transaction reverted: ${hash}`);
      }

      // Update batch mint record
      await this.pool.query(
        `UPDATE batch_mints 
         SET status = 'confirmed', confirmed_at = NOW(), block_number = $1, gas_used = $2 
         WHERE batch_tx_hash = $3`,
        [receipt.blockNumber.toString(), receipt.gasUsed.toString(), hash]
      );

      // Mark items as completed and move to history
      const dbUpdateStart = Date.now();
      const client = await this.pool.connect();
      
      try {
        await client.query("BEGIN");

        for (const item of itemsToProcess) {
          // Update queue status
          await client.query(
            `UPDATE mint_queue 
             SET status = 'completed', processed_at = NOW(), mint_tx_hash = $1 
             WHERE id = $2`,
            [hash, item.id]
          );

          // Move to history
          await client.query(
            `INSERT INTO mint_history 
             (payer_address, payment_tx_hash, tx_hash_bytes32, token_address, mint_tx_hash, amount, block_number, payment_type, completed_at)
             SELECT payer_address, payment_tx_hash, tx_hash_bytes32, token_address, $1, $2, $3, payment_type, NOW()
             FROM mint_queue WHERE id = $4`,
            [hash, mintAmount.toString(), receipt.blockNumber.toString(), item.id]
          );
        }

        await client.query("COMMIT");
        
        console.log(`   ⏱️  [${Date.now() - batchStartTime}ms] DB updated (took ${Date.now() - dbUpdateStart}ms)`);
        console.log(`   🎯 Total batch time: ${Date.now() - batchStartTime}ms\n`);
        
        // Confirm nonce (transaction succeeded)
        if (nonce !== null) {
          this.nonceManager.confirmNonce(nonce);
        }
        
        // Cache will auto-expire after TTL (no manual invalidation needed for high-frequency mints)
      } catch (error: any) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error: any) {
      console.error("❌ Batch processing error:", error.message);

      // Handle failed nonce (resync from chain)
      if (nonce !== null) {
        await this.nonceManager.handleFailedNonce(nonce);
      }

      // 🔧 FIX: Only mark THIS batch's items as failed, not ALL 'processing' items
      // This prevents marking unrelated concurrent batches as failed
      await this.pool.query(
        `UPDATE mint_queue 
         SET status = 'failed', error_message = $1, retry_count = retry_count + 1 
         WHERE id = ANY($2)`,
        [error.message, items.map((item) => item.id)]
      );
    }
  }

  /**
   * Get queue status for a specific item by ID
   * Now with dynamic queue position calculation and caching
   */
  async getQueueStatus(queueId: string) {
    // Check cache first
    const now = Date.now();
    const cached = this.queueStatusCache.get(queueId);
    
    if (cached && now - cached.timestamp < this.cacheTimeout) {
      // Return cached data if still fresh
      return cached.data;
    }
    
    const result = await this.pool.query(
      `SELECT 
        id, 
        payer_address, 
        payment_tx_hash, 
        tx_hash_bytes32, 
        token_address,
        status, 
        queue_position, 
        mint_tx_hash,
        error_message,
        retry_count,
        payment_type,
        created_at,
        updated_at,
        processed_at,
        -- Dynamically calculate current queue position
        (
          SELECT COUNT(*) 
          FROM mint_queue mq2 
          WHERE mq2.status = 'pending' 
          AND mq2.created_at < mq.created_at
        ) + 1 as current_queue_position
      FROM mint_queue mq
      WHERE id = $1`,
      [queueId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    
    // Use dynamic position for pending items
    const currentPosition = row.status === 'pending' 
      ? parseInt(row.current_queue_position) 
      : 0;
    
    // Calculate estimated wait time based on batch processing
    let estimatedWaitSeconds = 0;
    if (currentPosition > 0) {
      // More accurate estimate based on batch size and interval
      const batchSize = this.maxBatchSize || 500;
      const batchInterval = this.batchInterval / 1000 || 10; // Convert to seconds
      const estimatedBatches = Math.ceil(currentPosition / batchSize);
      estimatedWaitSeconds = estimatedBatches * batchInterval;
    }
    
    const statusData = {
      ...row,
      queuePosition: currentPosition,  // Use dynamic position
      estimatedWaitSeconds,
    };
    
    // Cache the result (only for pending items, completed/failed don't change)
    if (row.status === 'pending') {
      this.queueStatusCache.set(queueId, {
        data: statusData,
        timestamp: now,
      });
    } else {
      // Remove from cache if completed/failed
      this.queueStatusCache.delete(queueId);
    }
    
    return statusData;
  }
  
  /**
   * Clear cache for specific queue items (called after batch processing)
   */
  private clearQueueCache(queueIds?: string[]) {
    if (queueIds && queueIds.length > 0) {
      // Clear specific items
      queueIds.forEach(id => this.queueStatusCache.delete(id));
    } else {
      // Clear all cache
      this.queueStatusCache.clear();
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const result = await this.pool.query("SELECT * FROM queue_stats");
    return result.rows[0];
  }

  /**
   * Get queue status for a specific payer
   */
  async getPayerQueueStatus(payerAddress: string) {
    const result = await this.pool.query(
      `SELECT id, status, queue_position, created_at, processed_at, mint_tx_hash, error_message 
       FROM mint_queue 
       WHERE payer_address = $1 
       ORDER BY created_at DESC 
       LIMIT 10`,
      [payerAddress]
    );
    return result.rows;
  }

  /**
   * Get recent batch mints
   */
  async getRecentBatches(limit: number = 10) {
    const result = await this.pool.query(
      `SELECT * FROM batch_mints 
       ORDER BY created_at DESC 
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  }
}

