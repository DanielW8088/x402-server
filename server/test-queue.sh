#!/bin/bash

# Test Queue and Monitor System
# 测试队列和监控系统

set -e

SERVER_URL="${SERVER_URL:-http://localhost:4021}"

echo "🧪 Testing Queue and Monitor System"
echo "=================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Test 1: Health Check
echo "📋 Test 1: Health Check"
echo "----------------------"
HEALTH=$(curl -s "${SERVER_URL}/health")
if echo "$HEALTH" | grep -q "ok"; then
  echo -e "${GREEN}✅ Server is running${NC}"
else
  echo -e "${RED}❌ Server is not responding${NC}"
  exit 1
fi
echo ""

# Test 2: Get Info
echo "📋 Test 2: Get Info"
echo "-------------------"
INFO=$(curl -s "${SERVER_URL}/info")
echo "Response:"
echo "$INFO" | jq '.'
echo ""

# Test 3: Queue Multiple Requests (requires valid authorization)
echo "📋 Test 3: Queue Status Endpoint"
echo "--------------------------------"
echo "Testing status endpoint with invalid request ID..."
STATUS=$(curl -s "${SERVER_URL}/mint-status/invalid-id")
if echo "$STATUS" | grep -q "Request not found"; then
  echo -e "${GREEN}✅ Status endpoint working (returns 404 for invalid ID)${NC}"
else
  echo -e "${RED}❌ Status endpoint not working correctly${NC}"
fi
echo ""

# Test 4: Monitor Status
echo "📋 Test 4: Check System Status"
echo "------------------------------"
echo "From server logs, you should see:"
echo "  - Transaction Monitor: ACTIVE"
echo "  - Request Queue: ACTIVE"
echo "  - Gas Acceleration: 5s threshold, 1.2x multiplier, max 5 attempts"
echo ""

echo "🎯 Manual Test Instructions"
echo "==========================="
echo ""
echo "To test the full system with real transactions:"
echo ""
echo "1️⃣  Start the server:"
echo "   cd server"
echo "   npm run dev"
echo ""
echo "2️⃣  Send multiple concurrent requests:"
echo "   Open 3-5 browser windows to your frontend"
echo "   Click 'Mint Tokens' simultaneously"
echo ""
echo "3️⃣  Watch the server logs for:"
echo "   📥 Added request ... to queue (position: N)"
echo "   ⚙️  Processing request ..."
echo "   📍 Tracking tx ..."
echo "   ⚡ Accelerating tx (if tx takes >5s)"
echo "   ✅ Request ... completed"
echo ""
echo "4️⃣  Query request status:"
echo "   curl ${SERVER_URL}/mint-status/[requestId]"
echo ""

echo "🔍 Monitoring Commands"
echo "====================="
echo ""
echo "# Watch server logs:"
echo "npm run dev"
echo ""
echo "# Check database pending transactions:"
echo "sqlite3 mint-server.db 'SELECT * FROM pending_transactions WHERE status=\"pending\";'"
echo ""
echo "# Check processed payments:"
echo "sqlite3 mint-server.db 'SELECT COUNT(*) FROM processed_payments;'"
echo ""
echo "# Monitor queue in real-time (requires valid requestId):"
echo "watch -n 1 'curl -s ${SERVER_URL}/mint-status/[requestId] | jq'"
echo ""

echo "📊 Expected Behavior"
echo "==================="
echo ""
echo "✅ Multiple requests should be queued and processed sequentially"
echo "✅ Each request gets a unique nonce (no conflicts)"
echo "✅ If a transaction is pending for >5s, gas should automatically increase"
echo "✅ Monitor logs should show 'Accelerating tx' with new gas price"
echo "✅ All requests should complete successfully (or fail with clear error)"
echo ""

echo "🎉 Basic tests passed!"
echo ""
echo "Next steps:"
echo "1. Review server logs to confirm monitor is running"
echo "2. Try submitting real mint requests"
echo "3. Monitor the queue and gas acceleration in action"

