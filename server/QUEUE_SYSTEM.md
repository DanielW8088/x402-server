# Queue System Documentation

## Overview

The queue-based token mint system prevents nonce conflicts and enables efficient batch minting when multiple users request tokens simultaneously.

## Architecture

### Components

1. **PostgreSQL Database** - Persistent storage for queue and history
2. **Queue Processor** - Background worker that processes mint requests in batches
3. **Express API** - Handles incoming mint requests and queue queries

### Database Schema

#### Tables

- **mint_queue** - Pending and processing mint requests
- **mint_history** - Completed mint records
- **batch_mints** - Batch transaction records
- **system_settings** - Configurable system parameters

#### Key Features

- UUID-based queue items
- Status tracking (pending → processing → completed/failed)
- Queue position management
- Retry mechanism for failed mints
- Analytics via views

## Batch Processing

### How It Works

1. User sends mint request → Added to queue immediately
2. Background processor runs every 10 seconds
3. Fetches up to 50 pending requests from queue
4. Calls `batchMint()` contract function with all addresses
5. Waits for confirmation
6. Updates all queue items and moves to history

### Benefits

- **Prevents nonce conflicts** - Single transaction sequence
- **Gas efficient** - Batch multiple mints in one transaction
- **Scalable** - Handles concurrent requests
- **Reliable** - Database persistence survives crashes

## Setup

### 1. Install PostgreSQL

```bash
# macOS
brew install postgresql@14
brew services start postgresql@14

# Ubuntu
sudo apt install postgresql-14
sudo systemctl start postgresql
```

### 2. Create Database

```bash
psql postgres
```

```sql
CREATE DATABASE token_mint;
CREATE USER mint_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE token_mint TO mint_user;
\q
```

### 3. Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```
DATABASE_URL=postgresql://mint_user:your_secure_password@localhost:5432/token_mint
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Start Server

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

The server will automatically:
- Connect to PostgreSQL
- Initialize database schema
- Start queue processor

## API Endpoints

### Mint Request (Add to Queue)

```bash
POST /mint
```

Request body:
```json
{
  "payer": "0x..."
}
```

Response:
```json
{
  "success": true,
  "message": "Mint request added to queue",
  "queueId": "550e8400-e29b-41d4-a716-446655440000",
  "queuePosition": 5,
  "payer": "0x...",
  "estimatedWaitSeconds": 10,
  "paymentType": "x402"
}
```

### Queue Status

```bash
GET /queue/status
```

Response:
```json
{
  "stats": {
    "pending_count": 12,
    "processing_count": 0,
    "completed_count": 1543,
    "failed_count": 2,
    "oldest_pending": "2025-10-27T10:30:00.000Z",
    "unique_payers_pending": 8
  },
  "recentBatches": [...],
  "batchInterval": 10,
  "maxBatchSize": 50
}
```

### Payer Status

```bash
GET /queue/payer/0x...
```

Response:
```json
{
  "payer": "0x...",
  "requests": [
    {
      "id": "uuid",
      "status": "completed",
      "queue_position": 3,
      "created_at": "...",
      "processed_at": "...",
      "mint_tx_hash": "0x...",
      "error_message": null
    }
  ]
}
```

### Queue Item Status

```bash
GET /queue/item/:queueId
```

Response:
```json
{
  "id": "uuid",
  "payer_address": "0x...",
  "status": "pending",
  "queue_position": 5,
  "created_at": "...",
  "updated_at": "...",
  "processed_at": null,
  "mint_tx_hash": null,
  "error_message": null,
  "retry_count": 0,
  "payment_type": "x402"
}
```

## Configuration

### System Settings

Settings can be configured in the database:

```sql
-- Update batch interval to 5 seconds
UPDATE system_settings SET value = '5' WHERE key = 'batch_interval_seconds';

-- Update max batch size to 100
UPDATE system_settings SET value = '100' WHERE key = 'max_batch_size';

-- Update retry attempts
UPDATE system_settings SET value = '5' WHERE key = 'retry_max_attempts';
```

Settings take effect on next server restart or processor cycle.

## Monitoring

### Database Queries

```sql
-- View queue statistics
SELECT * FROM queue_stats;

-- Check pending requests
SELECT * FROM mint_queue WHERE status = 'pending' ORDER BY created_at;

-- View recent batches
SELECT * FROM batch_mints ORDER BY created_at DESC LIMIT 10;

-- Check failed mints
SELECT * FROM mint_queue WHERE status = 'failed';

-- User mint history
SELECT * FROM mint_history WHERE payer_address = '0x...' ORDER BY completed_at DESC;
```

### Logs

The server logs all important events:
- ✅ Successful batch processing
- ❌ Failed mints with error details
- 📊 Queue statistics
- 🔄 Processor status

## Troubleshooting

### Queue Not Processing

1. Check processor is running: Look for "🔄 Starting queue processor" in logs
2. Check database connection: `SELECT * FROM queue_stats;`
3. Check for pending items: `SELECT COUNT(*) FROM mint_queue WHERE status = 'pending';`

### Failed Mints

1. Check error messages: `SELECT * FROM mint_queue WHERE status = 'failed';`
2. Common issues:
   - Insufficient gas (server wallet needs ETH)
   - Max supply reached
   - Nonce issues (shouldn't happen with queue)
   - Contract paused

### Retry Failed Mints

```sql
-- Reset failed mints to pending (manual retry)
UPDATE mint_queue 
SET status = 'pending', error_message = NULL 
WHERE status = 'failed' AND retry_count < 3;
```

## Performance

### Expected Throughput

- **Batch size**: 50 mints per batch
- **Interval**: 10 seconds
- **Throughput**: ~300 mints per minute
- **Gas per batch**: ~150k * batch_size

### Optimization Tips

1. **Increase batch size** for higher throughput (watch gas limits)
2. **Decrease interval** for faster processing (watch RPC limits)
3. **Add indexes** for custom queries
4. **Use connection pooling** (already configured)

## Scaling

### Horizontal Scaling

For higher load:

1. **Add read replicas** for queue status queries
2. **Separate processor** into dedicated worker process
3. **Multiple processors** with distributed locking (PostgreSQL advisory locks)

### Database Maintenance

```sql
-- Clean old completed records (keep last 30 days)
DELETE FROM mint_queue 
WHERE status = 'completed' 
AND processed_at < NOW() - INTERVAL '30 days';

-- Archive to mint_history (already done automatically)
-- Vacuum database
VACUUM ANALYZE mint_queue;
VACUUM ANALYZE mint_history;
```

## Security

1. **Database access** - Use separate user with minimal privileges
2. **Connection string** - Store in environment variables, never commit
3. **SQL injection** - Use parameterized queries (already implemented)
4. **Rate limiting** - Consider adding per-user limits

## Migration from Single-Threaded

If migrating from the old system:

1. Deploy queue system to new endpoint
2. Test thoroughly with testnet
3. Update frontend to use new endpoints
4. Switch DNS/load balancer to new system
5. Keep old system running briefly for in-flight transactions

## Frontend Integration

Update your frontend to:

1. Show queue position after mint request
2. Poll `/queue/item/:queueId` for status updates
3. Display estimated wait time
4. Show queue statistics on mint page

Example:
```typescript
// Submit mint request
const response = await fetch('/mint', { method: 'POST', ... });
const { queueId, queuePosition, estimatedWaitSeconds } = await response.json();

// Poll for status
const checkStatus = setInterval(async () => {
  const status = await fetch(`/queue/item/${queueId}`);
  const data = await status.json();
  
  if (data.status === 'completed') {
    clearInterval(checkStatus);
    // Show success with data.mint_tx_hash
  } else if (data.status === 'failed') {
    clearInterval(checkStatus);
    // Show error with data.error_message
  }
}, 2000); // Check every 2 seconds
```

