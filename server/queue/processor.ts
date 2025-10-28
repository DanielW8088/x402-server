import { Pool } from "pg";
import { WalletClient, PublicClient, parseAbi } from "viem";

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
}

export class MintQueueProcessor {
  private pool: Pool;
  private walletClient: WalletClient;
  private publicClient: PublicClient;
  private tokenContractAddress: `0x${string}` | null;
  private isProcessing: boolean = false;
  private batchInterval: number = 10000; // 10 seconds
  private maxBatchSize: number = 50;
  private processorInterval: NodeJS.Timeout | null = null;

  constructor(
    pool: Pool,
    walletClient: WalletClient,
    publicClient: PublicClient,
    tokenContractAddress?: `0x${string}`
  ) {
    this.pool = pool;
    this.walletClient = walletClient;
    this.publicClient = publicClient;
    this.tokenContractAddress = tokenContractAddress || null;
  }

  /**
   * Start the queue processor
   */
  async start() {
    console.log(`🔄 Starting queue processor (batch interval: ${this.batchInterval}ms, max batch: ${this.maxBatchSize})`);
    
    // Load settings from database
    await this.loadSettings();
    
    console.log(`   ⚙️  Loaded from DB: ${this.batchInterval}ms interval, max batch: ${this.maxBatchSize}`);
    
    // Process immediately on start
    await this.processBatch();
    
    // Start recurring process
    this.scheduleNextBatch();
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

      // Insert into queue
      const result = await client.query(
        `INSERT INTO mint_queue 
        (payer_address, payment_tx_hash, authorization_data, tx_hash_bytes32, token_address, payment_type, queue_position) 
        VALUES ($1, $2, $3, $4, $5, $6, $7) 
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
      console.log(`✅ Added to queue: ${queueId} (position: ${queuePosition}, payer: ${payerAddress})`);
      
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
   */
  async processBatch() {
    if (this.isProcessing) {
      console.log("⏭️  Skipping batch - already processing");
      return;
    }

    this.isProcessing = true;

    try {
      // Get pending items
      const result = await this.pool.query(
        `SELECT id, payer_address, tx_hash_bytes32, payment_type, token_address 
         FROM mint_queue 
         WHERE status = 'pending' 
         ORDER BY created_at ASC 
         LIMIT $1`,
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

      console.log(`   Grouped into ${itemsByToken.size} token(s)`);

      // Process each token group
      for (const [tokenAddr, tokenItems] of itemsByToken.entries()) {
        await this.processBatchForToken(tokenAddr as `0x${string}`, tokenItems);
      }
    } catch (error: any) {
      console.error("❌ Batch processing error:", error.message);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process a batch for a specific token
   */
  private async processBatchForToken(tokenAddress: `0x${string}`, items: QueueItem[]) {
    try {
      const addresses: `0x${string}`[] = items.map((item) => item.payer_address as `0x${string}`);
      const txHashes: `0x${string}`[] = items.map((item) => item.tx_hash_bytes32 as `0x${string}`);

      console.log(`   Processing ${items.length} mint(s) for token ${tokenAddress.slice(0, 10)}...`);

      // Mark as processing
      await this.pool.query(
        `UPDATE mint_queue 
         SET status = 'processing', updated_at = NOW() 
         WHERE id = ANY($1)`,
        [items.map((item) => item.id)]
      );

      // Check remaining supply
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

      const totalRequired = mintAmount * BigInt(items.length);
      if (remainingSupply < totalRequired) {
        throw new Error(`Insufficient supply: need ${totalRequired}, have ${remainingSupply}`);
      }

      // Use EIP-1559 for Base (much cheaper!)
      const block = await this.publicClient.getBlock();
      const baseFeePerGas = block.baseFeePerGas || 100000000n; // 0.1 gwei fallback
      
      // Priority fee (miner tip) - Base is cheap, very low tip needed
      const maxPriorityFeePerGas = 1000000n; // 0.001 gwei (省钱模式)
      
      // Max fee = base fee * 1.1 + priority fee (只加 10% buffer，不是 300%)
      const maxFeePerGas = (baseFeePerGas * 110n) / 100n + maxPriorityFeePerGas;
      
      console.log(`   💰 EIP-1559 Gas (省钱模式):`);
      console.log(`      - Base Fee: ${Number(baseFeePerGas) / 1e9} gwei`);
      console.log(`      - Priority Fee: ${Number(maxPriorityFeePerGas) / 1e9} gwei`);
      console.log(`      - Max Fee: ${Number(maxFeePerGas) / 1e9} gwei`);
      console.log(`   🎨 Minting to ${items.length} address(es)...`);

      // Use batchMint for multiple addresses, mint for single address
      let hash: `0x${string}`;
      let gasLimit: bigint;
      
      if (items.length === 1) {
        gasLimit = 150000n; // 降低单个 mint 的 gas limit
        hash = await this.walletClient.writeContract({
          address: tokenAddress,
          abi: tokenAbi,
          functionName: "mint",
          args: [addresses[0], txHashes[0]],
          gas: gasLimit,
          maxFeePerGas,
          maxPriorityFeePerGas,
        } as any);
      } else {
        // 批量更省：基础 100k + 每个地址 50k
        gasLimit = BigInt(100000 + 50000 * items.length);
        hash = await this.walletClient.writeContract({
          address: tokenAddress,
          abi: tokenAbi,
          functionName: "batchMint",
          args: [addresses, txHashes],
          gas: gasLimit,
          maxFeePerGas,
          maxPriorityFeePerGas,
        } as any);
      }
      
      // 估算成本
      const estimatedCostWei = gasLimit * maxFeePerGas;
      const estimatedCostEth = Number(estimatedCostWei) / 1e18;
      const costPerUser = estimatedCostEth / items.length;
      console.log(`   💸 Estimated Cost: ${estimatedCostEth.toFixed(6)} ETH (~$${(estimatedCostEth * 2500).toFixed(2)} @ $2500/ETH)`);
      console.log(`   👤 Per User: ${costPerUser.toFixed(6)} ETH (~$${(costPerUser * 2500).toFixed(4)})`)

      console.log(`   ✅ Batch mint transaction sent: ${hash}`);

      // Record batch mint
      await this.pool.query(
        `INSERT INTO batch_mints (batch_tx_hash, mint_count, status) 
         VALUES ($1, $2, 'pending')`,
        [hash, items.length]
      );

      // Wait for confirmation
      console.log(`⏳ Waiting for confirmation...`);
      const receipt = await this.publicClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        timeout: 120_000,
      });

      // 计算实际成本
      const actualGasUsed = receipt.gasUsed;
      const effectiveGasPrice = receipt.effectiveGasPrice || 0n;
      const actualCostWei = actualGasUsed * effectiveGasPrice;
      const actualCostEth = Number(actualCostWei) / 1e18;
      const actualCostPerUser = actualCostEth / items.length;
      
      console.log(`✅ Batch confirmed in block ${receipt.blockNumber}`);
      console.log(`   💰 Actual Cost: ${actualCostEth.toFixed(6)} ETH ($${(actualCostEth * 2500).toFixed(2)})`);
      console.log(`   👤 Per User: ${actualCostPerUser.toFixed(6)} ETH ($${(actualCostPerUser * 2500).toFixed(4)})`);
      console.log(`   ⛽ Gas Used: ${actualGasUsed} / ${gasLimit} (${(Number(actualGasUsed) * 100 / Number(gasLimit)).toFixed(1)}% efficiency)`);
      console.log(`   💸 Effective Gas Price: ${Number(effectiveGasPrice) / 1e9} gwei`);

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
      const client = await this.pool.connect();
      
      try {
        await client.query("BEGIN");

        for (const item of items) {
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
        console.log(`✅ Batch processing complete: ${items.length} mint(s) successful\n`);
      } catch (error: any) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    } catch (error: any) {
      console.error("❌ Batch processing error:", error.message);

      // Mark items as failed
      await this.pool.query(
        `UPDATE mint_queue 
         SET status = 'failed', error_message = $1, retry_count = retry_count + 1 
         WHERE status = 'processing'`,
        [error.message]
      );
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get queue status for a specific item by ID
   */
  async getQueueStatus(queueId: string) {
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
        processed_at
      FROM mint_queue 
      WHERE id = $1`,
      [queueId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    const row = result.rows[0];
    
    // Calculate estimated wait time based on queue position
    let estimatedWaitSeconds = 0;
    if (row.queue_position && row.status === 'pending') {
      estimatedWaitSeconds = row.queue_position * 10; // rough estimate: 10s per position
    }
    
    return {
      ...row,
      queuePosition: row.queue_position,
      estimatedWaitSeconds,
    };
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

