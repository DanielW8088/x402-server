#!/bin/bash
# Production Payment Queue Cleanup Script

echo "=========================================="
echo "  Production Payment Queue Cleanup"
echo "=========================================="
echo ""

if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL not set"
  exit 1
fi

read -p "⚠️  This will cancel stuck payments. Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Cancelled."
  exit 0
fi

echo ""
echo "🧹 Cleaning up stuck payments..."
psql $DATABASE_URL << 'EOF'
-- Mark stuck payments as failed (cancelled not allowed by constraint)
UPDATE payment_queue 
SET status = 'failed', 
    error = COALESCE(error, '') || ' [Auto-cleanup: stuck payment]',
    processed_at = NOW()
WHERE status IN ('pending', 'processing')
  AND created_at < NOW() - INTERVAL '5 minutes';

-- Show results
SELECT 'After cleanup:' as info;
SELECT status, COUNT(*) FROM payment_queue GROUP BY status;
EOF

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "🔄 Next steps:"
echo "   1. Restart service: pm2 restart token-server"
echo "   2. Monitor logs: pm2 logs token-server -f"

