#!/bin/bash

# Test User Points & Invitation System APIs
# Usage: ./test-user-api.sh [SERVER_URL] [USER_ADDRESS]

SERVER_URL=${1:-"http://localhost:4021"}
USER_ADDRESS=${2:-"0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb"}

echo "🧪 Testing User Points & Invitation System APIs"
echo "Server: $SERVER_URL"
echo "User: $USER_ADDRESS"
echo ""

# Test 1: Get leaderboard stats
echo "1️⃣ Testing GET /api/leaderboard/stats"
curl -s "$SERVER_URL/api/leaderboard/stats" | jq '.'
echo ""

# Test 2: Get leaderboard (top 10)
echo "2️⃣ Testing GET /api/leaderboard?limit=10"
curl -s "$SERVER_URL/api/leaderboard?limit=10" | jq '.leaderboard[] | {rank, wallet_address, points}'
echo ""

# Test 3: Get user info
echo "3️⃣ Testing GET /api/user/:address"
USER_DATA=$(curl -s "$SERVER_URL/api/user/$USER_ADDRESS")
echo "$USER_DATA" | jq '.'
echo ""

# Extract invitation code
INVITATION_CODE=$(echo "$USER_DATA" | jq -r '.user.invitation_code')
echo "📋 User's invitation code: $INVITATION_CODE"
echo ""

# Test 4: Get user rank
echo "4️⃣ Testing GET /api/user/:address/rank"
curl -s "$SERVER_URL/api/user/$USER_ADDRESS/rank" | jq '.'
echo ""

# Test 5: Get user referrals
echo "5️⃣ Testing GET /api/user/:address/referrals"
curl -s "$SERVER_URL/api/user/$USER_ADDRESS/referrals" | jq '.'
echo ""

# Test 6: Try to use invitation code (will fail if already used or using own code)
echo "6️⃣ Testing POST /api/user/:address/invite (using own code - should fail)"
curl -s -X POST "$SERVER_URL/api/user/$USER_ADDRESS/invite" \
  -H "Content-Type: application/json" \
  -d "{\"invitationCode\": \"$INVITATION_CODE\"}" | jq '.'
echo ""

echo "✅ All tests completed!"
echo ""
echo "💡 Tips:"
echo "  - Check leaderboard cache: redis-cli GET 'leaderboard:global:100:0'"
echo "  - View all users: psql \$DATABASE_URL -c 'SELECT * FROM users ORDER BY points DESC LIMIT 10'"
echo "  - Clear cache: redis-cli FLUSHALL"

