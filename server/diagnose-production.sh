#!/bin/bash
# Production Environment Diagnostic Script

echo "=========================================="
echo "  Production Environment Diagnostics"
echo "=========================================="
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL not set. Please export it:"
  echo "   export DATABASE_URL='your_production_db_url'"
  exit 1
fi

echo "1️⃣  Checking payment queue status..."
psql $DATABASE_URL << 'EOF'
SELECT status, COUNT(*) as count, 
       MIN(created_at) as oldest, 
       MAX(created_at) as newest 
FROM payment_queue 
GROUP BY status
ORDER BY status;
EOF

echo ""
echo "2️⃣  Checking system settings..."
psql $DATABASE_URL << 'EOF'
SELECT key, value, description 
FROM system_settings 
WHERE key LIKE '%payment%' OR key LIKE '%batch%'
ORDER BY key;
EOF

echo ""
echo "3️⃣  Checking stuck payments..."
psql $DATABASE_URL << 'EOF'
SELECT COUNT(*) as stuck_count
FROM payment_queue
WHERE status IN ('pending', 'processing')
  AND created_at < NOW() - INTERVAL '5 minutes';
EOF

echo ""
echo "4️⃣  Recent failed payments..."
psql $DATABASE_URL << 'EOF'
SELECT id, LEFT(error, 80) as error, created_at
FROM payment_queue
WHERE status = 'failed'
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 5;
EOF

echo ""
echo "=========================================="
echo "  Diagnostic Complete"
echo "=========================================="
echo ""
echo "💡 If you see stuck payments, run:"
echo "   ./cleanup-production.sh"

