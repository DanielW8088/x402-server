#!/bin/bash

# Token Mint Platform - Service Startup Script
# Usage:
#   ./start.sh                  # Start all services
#   ./start.sh token-server     # Start token-server only
#   ./start.sh lp-deployer      # Start lp-deployer only

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the directory of this script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║       Token Mint Platform - Service Startup Script       ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if .env file exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ Error: .env file not found${NC}"
    echo -e "${YELLOW}💡 To fix:${NC}"
    echo "   cp env.multi-token.example .env"
    echo "   nano .env  # Edit with your configuration"
    exit 1
fi

# Check required environment variables
echo -e "${YELLOW}🔍 Checking environment variables...${NC}"

if ! grep -q "^DATABASE_URL=" .env; then
    echo -e "${RED}❌ DATABASE_URL not set in .env${NC}"
    exit 1
fi

# Check if pm2 is installed
if ! command -v pm2 &> /dev/null; then
    echo -e "${RED}❌ PM2 is not installed${NC}"
    echo -e "${YELLOW}💡 To install:${NC}"
    echo "   npm install -g pm2"
    exit 1
fi

# Check if tsx is installed
if ! command -v npx &> /dev/null || ! npx tsx --version &> /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  tsx not found, installing...${NC}"
    npm install -D tsx
fi

# Create logs directory if it doesn't exist
mkdir -p logs

# Parse arguments
SERVICE="$1"

if [ -z "$SERVICE" ]; then
    # Start all services
    echo -e "${GREEN}🚀 Starting all services...${NC}"
    pm2 start ecosystem.config.cjs
elif [ "$SERVICE" == "token-server" ]; then
    # Start token-server only
    echo -e "${GREEN}🚀 Starting Token Server...${NC}"
    pm2 start ecosystem.config.cjs --only token-server
elif [ "$SERVICE" == "lp-deployer" ]; then
    # Check LP Deployer specific requirements
    if ! grep -q "^LAUNCH_TOOL_ADDRESS=" .env; then
        echo -e "${RED}❌ LAUNCH_TOOL_ADDRESS not set in .env${NC}"
        echo -e "${YELLOW}💡 Deploy LaunchTool first:${NC}"
        echo "   cd ../contracts"
        echo "   npx hardhat run scripts/deployLaunchTool.js --network baseSepolia"
        exit 1
    fi
    
    if ! grep -q "^LP_DEPLOYER_PRIVATE_KEY=" .env; then
        echo -e "${RED}❌ LP_DEPLOYER_PRIVATE_KEY not set in .env${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}🚀 Starting LP Deployer...${NC}"
    pm2 start ecosystem.config.cjs --only lp-deployer
else
    echo -e "${RED}❌ Invalid service: $SERVICE${NC}"
    echo -e "${YELLOW}Usage:${NC}"
    echo "   ./start.sh                  # Start all services"
    echo "   ./start.sh token-server     # Start token-server only"
    echo "   ./start.sh lp-deployer      # Start lp-deployer only"
    exit 1
fi

# Wait a moment for services to start
sleep 2

echo ""
echo -e "${GREEN}✅ Services started!${NC}"
echo ""
echo -e "${YELLOW}📊 Status:${NC}"
pm2 status

echo ""
echo -e "${YELLOW}💡 Useful commands:${NC}"
echo "   pm2 logs              # View all logs"
echo "   pm2 logs $SERVICE     # View specific service logs"
echo "   pm2 restart $SERVICE  # Restart service"
echo "   pm2 stop $SERVICE     # Stop service"
echo "   pm2 monit             # Monitor dashboard"
echo ""
echo -e "${YELLOW}📖 Full guide: ./PM2_GUIDE.md${NC}"

