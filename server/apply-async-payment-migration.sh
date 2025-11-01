#!/bin/bash

# Apply async payment processing migration
# Adds 'sent' and 'confirmation_failed' statuses to payment_queue

set -e

echo "🚀 Applying async payment processing migration..."
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ ERROR: DATABASE_URL environment variable not set"
  echo "   Please set it first: export DATABASE_URL='your_database_url'"
  exit 1
fi

echo "📋 Migration will:"
echo "   1. Add 'sent' status for async tx confirmations"
echo "   2. Add 'confirmation_failed' status for timeout/revert cases"
echo "   3. Create index for efficient confirmation processing"
echo ""

# Show current status distribution
echo "📊 Current payment queue status distribution:"
psql "$DATABASE_URL" -c "SELECT status, COUNT(*) FROM payment_queue GROUP BY status ORDER BY status;" || true
echo ""

read -p "Continue with migration? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "❌ Migration cancelled"
  exit 1
fi

# Apply migration
echo "🔧 Applying migration..."
psql "$DATABASE_URL" -f db/migrations/006_update_payment_queue_status.sql

echo ""
echo "✅ Migration applied successfully!"
echo ""

# Show updated constraint
echo "📋 Updated status constraint:"
psql "$DATABASE_URL" -c "
  SELECT con.conname, pg_get_constraintdef(con.oid)
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'payment_queue' 
  AND con.conname = 'payment_queue_status_check';
"

echo ""
echo "✅ Next steps:"
echo "   1. Rebuild server: cd /Users/daniel/code/402/token-mint/server && npm run build"
echo "   2. Restart server: pm2 restart token-mint-server"
echo "   3. Monitor logs: pm2 logs token-mint-server --lines 100"
echo ""
echo "📖 For full documentation, see: ASYNC_PAYMENT_UPGRADE.md"

