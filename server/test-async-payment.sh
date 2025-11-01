#!/bin/bash

# Test async payment processing performance
# Compares queue processing speed before and after upgrade

set -e

echo "🧪 Testing Async Payment Processing Performance"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable not set"
  exit 1
fi

echo "📊 Current Queue Status:"
psql "$DATABASE_URL" -c "
  SELECT 
    status,
    COUNT(*) as count,
    MIN(created_at) as oldest,
    MAX(created_at) as newest
  FROM payment_queue 
  GROUP BY status 
  ORDER BY status;
"

echo ""
echo "📈 Recent Processing Performance (last 100 payments):"
psql "$DATABASE_URL" -c "
  SELECT 
    status,
    COUNT(*) as count,
    ROUND(AVG(EXTRACT(EPOCH FROM (processed_at - created_at))), 2) as avg_seconds,
    MIN(EXTRACT(EPOCH FROM (processed_at - created_at))) as min_seconds,
    MAX(EXTRACT(EPOCH FROM (processed_at - created_at))) as max_seconds
  FROM payment_queue 
  WHERE processed_at IS NOT NULL
  AND created_at > NOW() - INTERVAL '1 hour'
  GROUP BY status
  ORDER BY status;
"

echo ""
echo "🔍 Pending Confirmations (sent but not confirmed):"
psql "$DATABASE_URL" -c "
  SELECT 
    id,
    LEFT(payer, 10) || '...' as payer,
    LEFT(tx_hash, 15) || '...' as tx_hash,
    processed_at,
    ROUND(EXTRACT(EPOCH FROM (NOW() - processed_at))) as seconds_ago
  FROM payment_queue 
  WHERE status = 'sent'
  ORDER BY processed_at ASC
  LIMIT 10;
"

echo ""
echo "⚠️  Failed Confirmations (last 10):"
psql "$DATABASE_URL" -c "
  SELECT 
    id,
    LEFT(payer, 10) || '...' as payer,
    LEFT(error, 50) || '...' as error,
    processed_at
  FROM payment_queue 
  WHERE status = 'confirmation_failed'
  ORDER BY processed_at DESC
  LIMIT 10;
" || echo "   (None found - good!)"

echo ""
echo "💡 Processing Rate (last 5 minutes):"
psql "$DATABASE_URL" -c "
  SELECT 
    DATE_TRUNC('minute', processed_at) as minute,
    COUNT(*) as payments_processed,
    COUNT(*) / 60.0 as per_second
  FROM payment_queue 
  WHERE processed_at > NOW() - INTERVAL '5 minutes'
  GROUP BY DATE_TRUNC('minute', processed_at)
  ORDER BY minute DESC;
"

echo ""
echo "✅ Test complete!"
echo ""
echo "Expected Results After Upgrade:"
echo "  - avg_seconds for 'completed' should be < 15s (vs 60+ before)"
echo "  - Some payments may be in 'sent' status (confirming)"
echo "  - Processing rate should be 10-50x higher under load"

