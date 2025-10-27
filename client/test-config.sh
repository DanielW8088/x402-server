#!/bin/bash
# Test configuration script

echo "Creating test .env file..."
cat > .env << 'ENVEOF'
# Test configuration
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
SERVER_URL=http://localhost:4021
USDC_CONTRACT_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
NETWORK=base-sepolia
PAYMENT_AMOUNT_USDC=1
ENVEOF

echo "✅ Test .env created"
echo ""
echo "To run the client:"
echo "  npm start"
echo ""
echo "⚠️  Note: This is a test private key. Replace with your own for actual use!"
