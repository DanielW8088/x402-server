import Database from 'better-sqlite3';
import path from 'path';

// Initialize SQLite database
const dbPath = path.join(__dirname, 'mint-server.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS pending_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nonce INTEGER NOT NULL,
    tx_hash TEXT UNIQUE NOT NULL,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    type TEXT NOT NULL, -- 'usdc_transfer' or 'mint'
    status TEXT NOT NULL, -- 'pending', 'confirmed', 'failed'
    created_at INTEGER NOT NULL,
    confirmed_at INTEGER,
    error TEXT
  );

  CREATE TABLE IF NOT EXISTS processed_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    payment_tx_hash TEXT UNIQUE NOT NULL,
    payer_address TEXT NOT NULL,
    mint_tx_hash TEXT,
    amount TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    completed_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_pending_nonce ON pending_transactions(nonce, status);
  CREATE INDEX IF NOT EXISTS idx_pending_status ON pending_transactions(status);
  CREATE INDEX IF NOT EXISTS idx_payment_hash ON processed_payments(payment_tx_hash);
`);

// Prepared statements for better performance
const statements = {
  insertPendingTx: db.prepare(`
    INSERT INTO pending_transactions (nonce, tx_hash, from_address, to_address, type, status, created_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?)
  `),
  
  updateTxStatus: db.prepare(`
    UPDATE pending_transactions
    SET status = ?, confirmed_at = ?, error = ?
    WHERE tx_hash = ?
  `),
  
  getPendingTxByNonce: db.prepare(`
    SELECT * FROM pending_transactions
    WHERE nonce = ? AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1
  `),
  
  getPendingTxByHash: db.prepare(`
    SELECT * FROM pending_transactions
    WHERE tx_hash = ?
  `),
  
  getActivePendingCount: db.prepare(`
    SELECT COUNT(*) as count FROM pending_transactions
    WHERE status = 'pending' AND created_at > ?
  `),
  
  insertProcessedPayment: db.prepare(`
    INSERT INTO processed_payments (payment_tx_hash, payer_address, mint_tx_hash, amount, created_at, completed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `),
  
  getProcessedPayment: db.prepare(`
    SELECT * FROM processed_payments
    WHERE payment_tx_hash = ?
  `),
  
  cleanOldPendingTx: db.prepare(`
    DELETE FROM pending_transactions
    WHERE status = 'pending' AND created_at < ?
  `),
};

export interface PendingTransaction {
  id: number;
  nonce: number;
  tx_hash: string;
  from_address: string;
  to_address: string;
  type: 'usdc_transfer' | 'mint';
  status: 'pending' | 'confirmed' | 'failed';
  created_at: number;
  confirmed_at?: number;
  error?: string;
}

export interface ProcessedPayment {
  id: number;
  payment_tx_hash: string;
  payer_address: string;
  mint_tx_hash?: string;
  amount: string;
  created_at: number;
  completed_at?: number;
}

export const dbUtils = {
  /**
   * Record a pending transaction
   */
  recordPendingTx(
    nonce: number,
    txHash: string,
    fromAddress: string,
    toAddress: string,
    type: 'usdc_transfer' | 'mint'
  ): void {
    const now = Date.now();
    statements.insertPendingTx.run(nonce, txHash, fromAddress, toAddress, type, now);
    console.log(`📝 Recorded pending tx: ${txHash} (nonce: ${nonce}, type: ${type})`);
  },

  /**
   * Update transaction status
   */
  updateTxStatus(
    txHash: string,
    status: 'confirmed' | 'failed',
    error?: string
  ): void {
    const now = Date.now();
    statements.updateTxStatus.run(status, now, error || null, txHash);
    console.log(`✅ Updated tx ${txHash}: ${status}`);
  },

  /**
   * Check if a nonce is currently being used
   */
  isNoncePending(nonce: number): boolean {
    const result = statements.getPendingTxByNonce.get(nonce) as PendingTransaction | undefined;
    return !!result;
  },

  /**
   * Get pending transaction by hash
   */
  getPendingTx(txHash: string): PendingTransaction | undefined {
    return statements.getPendingTxByHash.get(txHash) as PendingTransaction | undefined;
  },

  /**
   * Get count of active pending transactions
   */
  getActivePendingCount(): number {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const result = statements.getActivePendingCount.get(fiveMinutesAgo) as { count: number };
    return result.count;
  },

  /**
   * Record a processed payment
   */
  recordProcessedPayment(
    paymentTxHash: string,
    payerAddress: string,
    mintTxHash: string,
    amount: string
  ): void {
    const now = Date.now();
    statements.insertProcessedPayment.run(
      paymentTxHash,
      payerAddress,
      mintTxHash,
      amount,
      now,
      now
    );
    console.log(`💾 Recorded processed payment: ${paymentTxHash}`);
  },

  /**
   * Check if payment has been processed
   */
  isPaymentProcessed(paymentTxHash: string): ProcessedPayment | undefined {
    return statements.getProcessedPayment.get(paymentTxHash) as ProcessedPayment | undefined;
  },

  /**
   * Clean up old pending transactions (older than 10 minutes)
   */
  cleanOldPendingTx(): void {
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    const result = statements.cleanOldPendingTx.run(tenMinutesAgo);
    if (result.changes > 0) {
      console.log(`🧹 Cleaned up ${result.changes} old pending transactions`);
    }
  },

  /**
   * Get database instance for custom queries
   */
  getDb(): Database.Database {
    return db;
  },
};

// Clean up old transactions every 5 minutes
setInterval(() => {
  dbUtils.cleanOldPendingTx();
}, 5 * 60 * 1000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n📊 Closing database...');
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n📊 Closing database...');
  db.close();
  process.exit(0);
});

