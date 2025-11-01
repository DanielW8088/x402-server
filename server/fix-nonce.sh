#!/bin/bash
# Fix nonce issues - Clean stuck payments and restart services
# 
# This script fixes nonce synchronization issues by:
# 1. Stopping services to prevent new transactions
# 2. Cleaning stuck queue items (allows them to be reprocessed)
# 3. Rebuilding code with latest fixes
# 4. Restarting services (NonceManager will resync from chain)

set -e

echo ""
echo "🔧 Nonce Fix Script"
echo "===================="
echo ""

# Step 1: Stop services (REQUIRED to reset NonceManager cache)
echo "1️⃣  Stopping services..."
pm2 stop token-server lp-deployer 2>/dev/null || echo "   Services not running"
echo "   ⏸️  Services stopped (NonceManager cache cleared)"

# Step 2: Clean stuck payment queue
echo ""
echo "2️⃣  Cleaning stuck payment queue..."
AUTO_CONFIRM=true node reset-payment-stuck.cjs

# Step 3: Clean stuck mint queue
echo ""
echo "3️⃣  Cleaning stuck mint queue..."
AUTO_CONFIRM=true node reset-stuck-processing.cjs

# Step 4: Rebuild
echo ""
echo "4️⃣  Rebuilding..."
npm run build

# Step 5: Restart services
echo ""
echo "5️⃣  Restarting services..."
pm2 restart token-server lp-deployer

# Step 6: Check status
echo ""
echo "6️⃣  Checking status..."
pm2 list

echo ""
echo "✅ Fix complete!"
echo ""
echo "📊 Monitor logs:"
echo "   pm2 logs token-server --lines 20"
echo "   pm2 logs lp-deployer --lines 20"
echo ""
echo "🔍 Look for:"
echo "   ✅ NonceManager initialized, starting nonce: XXXX"
echo "   ✅ Reset X items to 'pending' status"
echo ""

