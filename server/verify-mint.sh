#!/bin/bash
# Verify latest mint transaction

echo "🔍 Checking latest mint transaction..."
echo ""

# Transaction details
echo "📋 Transaction Details:"
echo "   Latest TX: 0x83bc3858ba8578457d1134c180676d5041f165b0d3306730cb6404137ea265d0"
echo "   Explorer: https://sepolia.basescan.org/tx/0x83bc3858ba8578457d1134c180676d5041f165b0d3306730cb6404137ea265d0"
echo ""

echo "📊 Expected Input Data:"
echo "   Function: mint(address to, bytes32 txHash)"
echo "   to:       0x7382a3a97e2623e6b33367c7c96426f85c61fd32 (User Wallet)"
echo "   txHash:   (should be unique)"
echo ""

echo "🔗 Previous (Old) TX: 0xaf1d1fd40c6ddd6abbf5783c522e0f11d422ee6bababa5e95be77a8b39bf9f3f"
echo "   This was BEFORE the fix!"
echo "   to: 0x29508ecfcf25873a1a40eadf83bc1efa0055ed8e (Agent - WRONG)"
echo ""

echo "✅ Please check the LATEST transaction (0x83bc3858...) input data."
echo "   The 'to' parameter should be 0x7382... (User), not 0x2950... (Agent)"

