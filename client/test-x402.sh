#!/bin/bash

# x402 Coinbase Client Test Script
# 测试 x402 协议客户端

set -e

echo "🧪 x402 Client Test Suite"
echo "=========================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    echo ""
    echo "Please copy env.x402.example to .env and configure:"
    echo "  cp env.x402.example .env"
    echo ""
    echo "Required variables:"
    echo "  - NETWORK (base-sepolia or base)"
    echo "  - PRIVATE_KEY (your wallet private key)"
    echo "  - SERVER_URL (x402 server URL)"
    exit 1
fi

echo -e "${GREEN}✅ Found .env file${NC}"

# Load environment variables
source .env

# Check required variables
if [ -z "$PRIVATE_KEY" ]; then
    echo -e "${RED}❌ Error: PRIVATE_KEY not set in .env${NC}"
    exit 1
fi

if [ -z "$SERVER_URL" ]; then
    echo -e "${YELLOW}⚠️  Warning: SERVER_URL not set, using default: http://localhost:4021${NC}"
    SERVER_URL="http://localhost:4021"
fi

if [ -z "$NETWORK" ]; then
    echo -e "${YELLOW}⚠️  Warning: NETWORK not set, using default: base-sepolia${NC}"
    NETWORK="base-sepolia"
fi

echo -e "${GREEN}✅ Environment variables configured${NC}"
echo ""

# Check if server is running
echo -e "${BLUE}🔍 Checking server...${NC}"
if curl -s -f "$SERVER_URL/health" > /dev/null 2>&1 || curl -s -f "$SERVER_URL/info" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Server is reachable at $SERVER_URL${NC}"
else
    echo -e "${RED}❌ Error: Server not reachable at $SERVER_URL${NC}"
    echo ""
    echo "Make sure the x402 server is running:"
    echo "  cd ../server"
    echo "  npm start"
    exit 1
fi
echo ""

# Test options
echo "Select which x402 client to test:"
echo ""
echo "1) x402-axios (Coinbase Official - withPaymentInterceptor)"
echo "2) x402-fetch (Coinbase Official - wrapFetchWithPayment) [Default]"
echo "3) Manual implementation (sends real USDC)"
echo ""
read -p "Enter your choice (1-3): " choice

echo ""

case $choice in
    1)
        echo -e "${BLUE}🚀 Testing x402-axios client...${NC}"
        echo ""
        npm run start:axios
        ;;
    2)
        echo -e "${BLUE}🚀 Testing x402-fetch client...${NC}"
        echo ""
        npm run start:fetch
        ;;
    3)
        echo -e "${BLUE}🚀 Testing manual x402 client (requires USDC)...${NC}"
        echo ""
        echo -e "${YELLOW}⚠️  This will send real USDC!${NC}"
        echo -e "${YELLOW}⚠️  Make sure you have USDC in your wallet${NC}"
        echo ""
        read -p "Continue? (y/n): " confirm
        if [ "$confirm" = "y" ]; then
            npm run start:manual
        else
            echo "Cancelled."
            exit 0
        fi
        ;;
    *)
        echo -e "${RED}Invalid choice${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}✨ Test completed!${NC}"

