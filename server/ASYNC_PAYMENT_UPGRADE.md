# Async Payment Processing Upgrade Guide

## 🚀 What Changed

**Before**: Payment processor sent tx and **waited up to 60 seconds** for confirmation before processing next batch
**After**: Payment processor sends tx and **immediately returns**, confirms in background

### Performance Improvement

- **Before**: 50 payments = ~60+ seconds (sequential confirmations)
- **After**: 50 payments = ~2-5 seconds (parallel sends, async confirmations)
- **Throughput**: ~10x faster (50 tx/min → 600+ tx/min)

## 📋 Changes Summary

### 1. New Payment Statuses

```
pending → processing → sent → completed
                       ↓
                    confirmation_failed (if tx timeout/revert)
```

- `sent`: Transaction sent to network, waiting for confirmation
- `confirmation_failed`: Transaction sent but failed to confirm (timeout/revert)

### 2. Two-Phase Processing

**Phase 1: Send Transactions (Fast)**
- Runs every 4 seconds (configurable)
- Sends batch of 50 txs in parallel
- Marks as `sent` immediately
- Returns without waiting for confirmations

**Phase 2: Confirm Transactions (Background)**
- Runs every 2 seconds independently
- Checks up to 20 `sent` txs in parallel
- Triggers callbacks (minting) when confirmed
- Marks as `completed` or `confirmation_failed`

### 3. Code Changes

**payment-processor.ts**:
- New `processConfirmations()` method - background confirmation loop
- Modified `processPayment()` - no longer waits for confirmation
- New `confirmPayment()` method - checks single tx confirmation
- New status tracking for `sent` and `confirmation_failed`

## 🔧 Deployment Steps

### Step 1: Run Database Migration

```bash
cd /Users/daniel/code/402/token-mint/server

# Connect to your database
psql $DATABASE_URL -f db/migrations/006_update_payment_queue_status.sql
```

Or manually:

```sql
-- Drop existing constraint
ALTER TABLE payment_queue DROP CONSTRAINT IF EXISTS payment_queue_status_check;

-- Add new constraint with additional statuses
ALTER TABLE payment_queue 
  ADD CONSTRAINT payment_queue_status_check 
  CHECK (status IN ('pending', 'processing', 'sent', 'completed', 'failed', 'confirmation_failed'));

-- Create index for 'sent' status
CREATE INDEX IF NOT EXISTS idx_payment_queue_sent_processed
  ON payment_queue(status, processed_at)
  WHERE status = 'sent';
```

### Step 2: Rebuild Server

```bash
cd /Users/daniel/code/402/token-mint/server

# Rebuild TypeScript
npm run build
```

### Step 3: Restart Server

```bash
# If using PM2
pm2 restart token-mint-server

# Or
./quick-restart.sh
```

### Step 4: Monitor Logs

Watch for new logging patterns:

```bash
pm2 logs token-mint-server --lines 100
```

Expected output:
```
📤 Sent payment tx: abc12345... (nonce: 123, tx: 0x1234...)
✅ Batch complete: 50 succeeded
🔍 Checking 20 pending confirmations...
   ✅ 18 confirmed, ❌ 2 failed
```

## 📊 Monitoring

### Check Queue Status

```sql
-- Overall stats
SELECT status, COUNT(*) 
FROM payment_queue 
GROUP BY status;

-- Pending confirmations
SELECT COUNT(*) as awaiting_confirmation
FROM payment_queue 
WHERE status = 'sent' 
AND processed_at > NOW() - INTERVAL '5 minutes';
```

### Identify Stuck Transactions

```sql
-- Transactions stuck in 'sent' for > 5 minutes
SELECT id, payer, tx_hash, processed_at,
       EXTRACT(EPOCH FROM (NOW() - processed_at)) as seconds_waiting
FROM payment_queue 
WHERE status = 'sent' 
AND processed_at < NOW() - INTERVAL '5 minutes'
ORDER BY processed_at ASC;
```

### Recovery Script

If you have transactions stuck in 'sent' status:

```bash
node reset-payment-stuck.cjs
```

## ⚙️ Configuration

Adjust processing intervals via database:

```sql
-- Batch send interval (default: 4000ms)
UPDATE system_settings 
SET value = '2000' 
WHERE key = 'payment_batch_interval_ms';

-- Batch size (default: 10, now can set higher like 50)
UPDATE system_settings 
SET value = '50' 
WHERE key = 'payment_batch_size';
```

Then restart server to apply changes.

## 🔍 Troubleshooting

### Issue: Transactions stuck in 'sent'

**Cause**: RPC node issues, network congestion, or confirmation loop not running

**Fix**:
```sql
-- Check if confirmation loop is processing
SELECT * FROM payment_queue WHERE status = 'sent' ORDER BY processed_at DESC LIMIT 10;

-- If stuck, manually mark as failed to retry
UPDATE payment_queue 
SET status = 'confirmation_failed', 
    error = 'Manual reset - stuck in sent'
WHERE status = 'sent' 
AND processed_at < NOW() - INTERVAL '10 minutes';
```

### Issue: High confirmation_failed rate

**Cause**: Network congestion, gas too low, or RPC reliability issues

**Fix**:
- Check RPC endpoint health
- Increase gas priority fee (currently 0.01 gwei)
- Check network block times

### Issue: Callbacks (minting) not triggering

**Cause**: Confirmation loop errors

**Check**:
```bash
# Look for callback errors in logs
pm2 logs | grep "Payment callback failed"

# Check mint queue status
psql $DATABASE_URL -c "SELECT status, COUNT(*) FROM mint_queue GROUP BY status;"
```

## 🎯 Performance Tuning

### For High Volume (1000+ pending)

```sql
-- Aggressive batch settings
UPDATE system_settings SET value = '1000' WHERE key = 'payment_batch_interval_ms';  -- 1 second
UPDATE system_settings SET value = '100' WHERE key = 'payment_batch_size';  -- 100 per batch
```

**Warning**: Ensure your RPC can handle the load (check rate limits).

### For Low Volume (< 50 pending)

Keep defaults:
- `payment_batch_interval_ms`: 4000 (4 seconds)
- `payment_batch_size`: 10-50

## 🔄 Rollback

If you need to rollback to synchronous processing:

1. Revert code changes:
```bash
git checkout HEAD~1 -- server/queue/payment-processor.ts
npm run build
pm2 restart token-mint-server
```

2. Clean up stuck 'sent' transactions:
```sql
-- Mark all 'sent' as 'failed' to reprocess
UPDATE payment_queue 
SET status = 'failed', 
    error = 'Rollback to sync processing'
WHERE status = 'sent';
```

## 📈 Expected Metrics

After deployment, you should see:

- ✅ Payment processing batch completes in < 10 seconds (vs 60+ seconds before)
- ✅ Queue depth decreases rapidly under load
- ✅ Most transactions confirm within 10-30 seconds
- ✅ Confirmation loop shows steady progress every 2 seconds
- ⚠️  Small number of `confirmation_failed` is normal (network issues)

## 🆘 Emergency Contacts

If critical issues arise:

1. Stop payment processor: `pm2 stop token-mint-server`
2. Check queue depth: `psql $DATABASE_URL -c "SELECT COUNT(*) FROM payment_queue WHERE status = 'pending';"`
3. Review logs: `pm2 logs token-mint-server --lines 500`
4. Contact: Check server/NONCE_TROUBLESHOOTING.md for nonce issues

