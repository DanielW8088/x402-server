# Migration Guide: Single-Thread → Queue System

## Overview

This guide helps you migrate from the single-threaded mint server to the queue-based system.

## Why Migrate?

### Problems with Single-Threaded Server
- ❌ **Nonce conflicts** when multiple users mint simultaneously
- ❌ **Transaction failures** due to race conditions
- ❌ **Poor scalability** - can't handle concurrent requests
- ❌ **Limited throughput** - processes one at a time

### Benefits of Queue System
- ✅ **Zero nonce conflicts** - single transaction sequence
- ✅ **Batch processing** - up to 50 mints per transaction
- ✅ **High throughput** - ~300 mints per minute
- ✅ **Database persistence** - survives server crashes
- ✅ **Queue visibility** - users see their position
- ✅ **Scalable architecture** - ready for future growth

## Prerequisites

1. PostgreSQL 14+ installed
2. Access to your server environment
3. Database credentials

## Step-by-Step Migration

### 1. Install PostgreSQL

```bash
# macOS
brew install postgresql@14
brew services start postgresql@14

# Ubuntu
sudo apt update
sudo apt install postgresql-14
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 2. Create Database & User

```bash
# Login to PostgreSQL
psql postgres

# Create database
CREATE DATABASE token_mint;

# Create user
CREATE USER mint_user WITH PASSWORD 'secure_password_here';

# Grant privileges
GRANT ALL PRIVILEGES ON DATABASE token_mint TO mint_user;

# Exit
\q
```

### 3. Backup Current Data (Optional)

If you have data in SQLite:

```bash
# Backup SQLite database
cp mint-server.db mint-server.db.backup

# Export processed payments (optional)
sqlite3 mint-server.db "SELECT * FROM processed_payments;" > processed_payments.csv
```

### 4. Update Dependencies

```bash
cd /path/to/server
npm install
```

New dependencies will be installed:
- `pg` - PostgreSQL client
- `@types/pg` - TypeScript types

### 5. Configure Environment

Create new `.env` based on queue example:

```bash
cp env.queue.example .env
```

Edit `.env`:

```bash
# ... existing variables ...

# Add PostgreSQL connection
DATABASE_URL=postgresql://mint_user:secure_password_here@localhost:5432/token_mint

# Optional: Queue tuning
BATCH_INTERVAL_SECONDS=10
MAX_BATCH_SIZE=50
```

### 6. Initialize Database

```bash
# Run setup script
./scripts/setup-db.sh
```

This will:
- Test database connection
- Create all required tables
- Set up indexes
- Insert default settings

### 7. Test the Queue System

```bash
# Start in development mode
npm run dev:queue
```

Look for:
```
✅ Database connected at: ...
✅ Database schema initialized successfully
🔄 Starting queue processor (batch interval: 10000ms, max batch: 50)
🚀 x402 Token Mint Server (Queue Mode) running on port 4021
```

### 8. Verify Endpoints

Test the new endpoints:

```bash
# Health check
curl http://localhost:4021/health

# Queue status
curl http://localhost:4021/queue/status

# Token info (should work as before)
curl http://localhost:4021/info
```

### 9. Update Frontend

Update your frontend to use the new response format:

**Before (single-threaded):**
```typescript
const response = await fetch('/mint', { ... });
const data = await response.json();
// { success: true, mintTxHash: "0x...", ... }
```

**After (queue system):**
```typescript
const response = await fetch('/mint', { ... });
const data = await response.json();
// { success: true, queueId: "uuid", queuePosition: 5, estimatedWaitSeconds: 10 }

// Poll for status
const checkStatus = setInterval(async () => {
  const status = await fetch(`/queue/item/${data.queueId}`);
  const item = await status.json();
  
  if (item.status === 'completed') {
    clearInterval(checkStatus);
    console.log('Minted!', item.mint_tx_hash);
  }
}, 2000);
```

See `frontend-example/` for complete React component.

### 10. Gradual Migration (Production)

For zero-downtime migration:

#### Option A: Blue-Green Deployment

1. Deploy queue system on new server/port
2. Test thoroughly
3. Update load balancer to point to new server
4. Monitor for issues
5. Decommission old server after 24h

#### Option B: Parallel Running

1. Run both systems simultaneously
2. Direct new traffic to queue system
3. Let old system finish pending requests
4. Switch all traffic to queue system
5. Shut down old system

### 11. Monitoring Setup

#### Database Monitoring

```sql
-- Check queue health
SELECT * FROM queue_stats;

-- Monitor batch processing
SELECT * FROM batch_mints 
ORDER BY created_at DESC 
LIMIT 10;

-- Find slow batches
SELECT 
  batch_tx_hash,
  mint_count,
  EXTRACT(EPOCH FROM (confirmed_at - created_at)) as seconds
FROM batch_mints
WHERE confirmed_at IS NOT NULL
ORDER BY seconds DESC
LIMIT 10;
```

#### Application Logs

```bash
# Monitor logs in real-time
tail -f /path/to/logs/app.log

# Look for batch processing
grep "Batch processing complete" /path/to/logs/app.log

# Check for errors
grep "ERROR" /path/to/logs/app.log
```

### 12. Performance Tuning

#### Increase Batch Size (for higher throughput)

```sql
UPDATE system_settings 
SET value = '100' 
WHERE key = 'max_batch_size';
```

Restart server for changes to take effect.

#### Decrease Batch Interval (for faster processing)

```sql
UPDATE system_settings 
SET value = '5' 
WHERE key = 'batch_interval_seconds';
```

**Warning:** Lower intervals increase RPC usage. Monitor your RPC provider limits.

### 13. Backup Strategy

```bash
# Daily database backup
pg_dump -U mint_user token_mint > backup_$(date +%Y%m%d).sql

# Restore from backup
psql -U mint_user token_mint < backup_20251027.sql
```

Consider:
- Automated daily backups (cron job)
- Weekly full backups
- Keep last 30 days of backups

### 14. Rollback Plan

If you need to rollback:

```bash
# Stop queue server
pm2 stop server-queue

# Start old server
npm run dev  # or pm2 start server

# Update load balancer to point to old server
```

## Data Migration (Optional)

To migrate existing processed payments from SQLite to PostgreSQL:

```javascript
// migration-script.js
const sqlite3 = require('sqlite3');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const db = new sqlite3.Database('mint-server.db');
  
  db.all('SELECT * FROM processed_payments', async (err, rows) => {
    if (err) throw err;
    
    for (const row of rows) {
      await pool.query(
        `INSERT INTO mint_history 
         (payer_address, payment_tx_hash, tx_hash_bytes32, mint_tx_hash, amount, payment_type) 
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (tx_hash_bytes32) DO NOTHING`,
        [
          row.payer_address,
          row.payment_tx_hash,
          row.tx_hash_bytes32,
          row.mint_tx_hash,
          row.amount,
          'migrated'
        ]
      );
    }
    
    console.log(`Migrated ${rows.length} records`);
  });
  
  db.close();
  await pool.end();
}

migrate();
```

## Troubleshooting

### Database Connection Failed

```
❌ Database connection failed: connection refused
```

**Solution:**
```bash
# Check PostgreSQL is running
brew services list  # macOS
systemctl status postgresql  # Linux

# Check connection
psql -U mint_user -d token_mint -h localhost
```

### Queue Not Processing

**Symptoms:** Requests stuck in "pending" status

**Check:**
1. Server logs for errors
2. Database connection: `SELECT * FROM queue_stats;`
3. Processor is running: Look for "🔄 Starting queue processor" in logs

**Solution:**
```bash
# Restart server
pm2 restart server-queue

# Check for stuck transactions
SELECT * FROM mint_queue WHERE status = 'processing' AND updated_at < NOW() - INTERVAL '5 minutes';

# Reset stuck items (if needed)
UPDATE mint_queue SET status = 'pending' WHERE status = 'processing';
```

### High Memory Usage

**Solution:**
```javascript
// Adjust connection pool size in index-queue.ts
const pool = new Pool({
  connectionString: databaseUrl,
  max: 10, // Reduce from 20
  idleTimeoutMillis: 30000,
});
```

### Slow Batch Processing

**Check:**
```sql
-- Average batch processing time
SELECT AVG(EXTRACT(EPOCH FROM (confirmed_at - created_at))) as avg_seconds
FROM batch_mints
WHERE confirmed_at IS NOT NULL;
```

**Solutions:**
1. Increase gas price buffer (edit index-queue.ts)
2. Use dedicated RPC endpoint
3. Reduce batch size temporarily

## Support & Resources

- 📖 [Queue System Documentation](./QUEUE_SYSTEM.md)
- 💻 [Frontend Integration](./frontend-example/README.md)
- 🐛 [Report Issues](https://github.com/your-repo/issues)

## Post-Migration Checklist

- [ ] PostgreSQL installed and running
- [ ] Database created and initialized
- [ ] Environment variables configured
- [ ] Queue server tested locally
- [ ] Frontend updated to poll queue status
- [ ] Deployed to production
- [ ] Monitoring set up
- [ ] Backup strategy in place
- [ ] Team trained on new system
- [ ] Old server decommissioned (after 24h)

## Performance Comparison

### Before (Single-Thread)
- Throughput: ~5-10 mints/minute
- Concurrent requests: ❌ Fails
- Nonce conflicts: ⚠️ Common
- Gas efficiency: 1 tx per mint

### After (Queue System)
- Throughput: ~300 mints/minute
- Concurrent requests: ✅ Handles gracefully
- Nonce conflicts: ✅ Zero
- Gas efficiency: 50 mints per tx

## Next Steps

Once migrated, consider:
1. **Add monitoring** (Grafana, DataDog, etc.)
2. **Set up alerts** for queue depth
3. **Optimize batch size** based on usage patterns
4. **Add rate limiting** per user
5. **Implement queue prioritization** (VIP users)
6. **Scale horizontally** if needed

---

**Questions?** Check the [Queue System Documentation](./QUEUE_SYSTEM.md) or open an issue.

