#!/bin/bash
# Test AI Agent System
# Usage: ./test-ai-agent.sh http://localhost:4021 0xYourWalletAddress

SERVER_URL=${1:-http://localhost:4021}
USER_ADDRESS=${2:-0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb}

echo "🤖 Testing AI Agent System"
echo "Server: $SERVER_URL"
echo "User: $USER_ADDRESS"
echo ""

# Test 1: Create agent wallet
echo "Test 1: Getting/Creating Agent Wallet"
curl -s "$SERVER_URL/api/ai-agent/wallet/$USER_ADDRESS" | jq .
echo ""

# Test 2: Send chat message
echo "Test 2: Sending Chat Message"
curl -s -X POST "$SERVER_URL/api/ai-agent/chat" \
  -H "Content-Type: application/json" \
  -d "{\"userAddress\":\"$USER_ADDRESS\",\"message\":\"我想 mint 个币\"}" | jq .
echo ""

# Test 3: Get chat history
echo "Test 3: Getting Chat History"
curl -s "$SERVER_URL/api/ai-agent/history/$USER_ADDRESS?limit=5" | jq .
echo ""

# Test 4: Get tasks
echo "Test 4: Getting User Tasks"
curl -s "$SERVER_URL/api/ai-agent/tasks/$USER_ADDRESS" | jq .
echo ""

echo "✅ Tests completed!"
echo ""
echo "Next steps:"
echo "1. Continue chatting via POST /api/ai-agent/chat"
echo "2. Follow the conversation to create a mint task"
echo "3. Fund the agent wallet with USDC"
echo "4. Watch tasks auto-execute!"

