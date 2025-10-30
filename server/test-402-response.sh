#!/bin/bash

# 测试 402 响应格式脚本
# 用法: ./test-402-response.sh <token_address>

TOKEN_ADDRESS=${1:-"0xdd8bb663c7245437c9c53c19e4d561e248574acd"}
SERVER_URL=${2:-"http://localhost:4021"}

echo "🧪 Testing x402 402 Response Format"
echo "=================================="
echo "Token Address: $TOKEN_ADDRESS"
echo "Server URL: $SERVER_URL"
echo ""

echo "📡 Sending POST request without payment..."
response=$(curl -s -X POST "$SERVER_URL/api/mint/$TOKEN_ADDRESS" \
  -H "Content-Type: application/json" \
  -d '{"quantity": 1}')

echo ""
echo "📥 Response received:"
echo "$response" | jq '.'

echo ""
echo "🔍 Validation checks:"

# Check if x402Version exists
if echo "$response" | jq -e '.x402Version' > /dev/null 2>&1; then
  version=$(echo "$response" | jq -r '.x402Version')
  echo "✅ x402Version: $version"
else
  echo "❌ x402Version: MISSING"
fi

# Check if accepts array exists
if echo "$response" | jq -e '.accepts' > /dev/null 2>&1; then
  count=$(echo "$response" | jq '.accepts | length')
  echo "✅ accepts: array with $count item(s)"
  
  # Check first payment option
  if [ "$count" -gt 0 ]; then
    scheme=$(echo "$response" | jq -r '.accepts[0].scheme')
    network=$(echo "$response" | jq -r '.accepts[0].network')
    amount=$(echo "$response" | jq -r '.accepts[0].maxAmountRequired')
    resource=$(echo "$response" | jq -r '.accepts[0].resource')
    echo "   - scheme: $scheme"
    echo "   - network: $network"
    echo "   - maxAmountRequired: $amount"
    echo "   - resource: $resource"
    
    # Validate resource is a full URL
    if [[ $resource =~ ^https?:// ]]; then
      echo "   ✅ resource is a valid full URL"
    else
      echo "   ❌ resource is NOT a full URL (will fail Zod validation!)"
    fi
  fi
else
  echo "❌ accepts: MISSING (this will cause 'cannot read map' error!)"
fi

echo ""
echo "=================================="
if echo "$response" | jq -e '.x402Version and .accepts' > /dev/null 2>&1; then
  echo "✅ 402 Response format is CORRECT!"
  echo "x402-fetch should work properly."
else
  echo "❌ 402 Response format is INCORRECT!"
  echo "x402-fetch will fail with 'cannot read map' error."
fi

