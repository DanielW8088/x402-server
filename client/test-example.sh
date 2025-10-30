#!/bin/bash

# Client Test Example Script
# This script helps you test the updated client

set -e

echo "🧪 x402 Token Mint Client - Test Example"
echo "========================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found${NC}"
    echo "Please create .env from template:"
    echo "  cp env.x402.example .env"
    exit 1
fi

# Load .env
export $(cat .env | grep -v '^#' | xargs)

# Validate required variables
echo "📋 Checking configuration..."
echo ""

if [ -z "$PRIVATE_KEY" ]; then
    echo -e "${RED}❌ PRIVATE_KEY not set${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} PRIVATE_KEY: ${PRIVATE_KEY:0:10}..."

if [ -z "$SERVER_URL" ]; then
    echo -e "${YELLOW}⚠${NC}  SERVER_URL not set, using default: http://localhost:4021"
    export SERVER_URL="http://localhost:4021"
fi
echo -e "${GREEN}✓${NC} SERVER_URL: $SERVER_URL"

if [ -z "$NETWORK" ]; then
    echo -e "${YELLOW}⚠${NC}  NETWORK not set, using default: base-sepolia"
    export NETWORK="base-sepolia"
fi
echo -e "${GREEN}✓${NC} NETWORK: $NETWORK"

if [ -z "$TOKEN_ADDRESS" ]; then
    echo ""
    echo -e "${RED}❌ TOKEN_ADDRESS not set${NC}"
    echo ""
    echo "Getting available tokens from server..."
    echo ""
    
    # Try to fetch tokens from server
    if curl -s "$SERVER_URL/api/tokens" > /dev/null 2>&1; then
        echo "Available tokens:"
        curl -s "$SERVER_URL/api/tokens" | jq -r '.tokens[] | "  \(.address) - \(.name) (\(.symbol))"' 2>/dev/null || \
        curl -s "$SERVER_URL/api/tokens"
        echo ""
        echo "Please set TOKEN_ADDRESS in .env to one of the above addresses"
    else
        echo -e "${RED}❌ Could not connect to server at $SERVER_URL${NC}"
        echo "Please make sure:"
        echo "  1. Server is running"
        echo "  2. SERVER_URL is correct"
        echo "  3. TOKEN_ADDRESS is set in .env"
    fi
    exit 1
fi
echo -e "${GREEN}✓${NC} TOKEN_ADDRESS: $TOKEN_ADDRESS"

# Get token info
echo ""
echo "📊 Fetching token info..."
echo ""

TOKEN_INFO=$(curl -s "$SERVER_URL/api/tokens/$TOKEN_ADDRESS")

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to fetch token info${NC}"
    exit 1
fi

# Display token info
echo "Token Information:"
echo "$TOKEN_INFO" | jq '.' 2>/dev/null || echo "$TOKEN_INFO"
echo ""

# Confirm
echo -e "${YELLOW}⚠️  Ready to mint token${NC}"
echo ""
read -p "Press Enter to continue or Ctrl+C to cancel..."

# Run the client
echo ""
echo "🚀 Starting client..."
echo "===================="
echo ""

npm start

echo ""
echo -e "${GREEN}✅ Test completed!${NC}"

