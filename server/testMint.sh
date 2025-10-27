#!/bin/bash

# 测试 Mint 功能
# 使用一个假的交易哈希来测试服务器响应

echo "🧪 Testing Mint API..."
echo ""

# 假的交易哈希和地址
FAKE_TX="0x1234567890123456789012345678901234567890123456789012345678901234"
TEST_ADDR="0x130777E1166C89A9CD539f6E8eE86F5C615BCff7"

echo "Sending request to http://localhost:4021/mint"
echo "Payment TX: $FAKE_TX"
echo "Payer: $TEST_ADDR"
echo ""

curl -X POST http://localhost:4021/mint \
  -H "Content-Type: application/json" \
  -d "{\"paymentTxHash\": \"$FAKE_TX\", \"payer\": \"$TEST_ADDR\"}" \
  -v \
  2>&1 | head -50

echo ""
echo "✅ Test complete"
