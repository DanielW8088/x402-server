#!/bin/bash

# Check environment variables for LP Deployer
# Usage: ./check-env.sh

echo "🔍 Checking environment variables for LP Deployer..."
echo ""

# Load .env if exists
if [ -f .env ]; then
    source .env
    echo "✅ .env file found and loaded"
else
    echo "⚠️  .env file not found"
fi

echo ""
echo "Required variables:"
echo "===================="

# Check DATABASE_URL
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL - Not set"
else
    echo "✅ DATABASE_URL - Set"
fi

# Check PRIVATE_KEY
if [ -z "$PRIVATE_KEY" ]; then
    echo "❌ PRIVATE_KEY - Not set (required for transferAssetsForLP)"
else
    echo "✅ PRIVATE_KEY - Set"
fi

# Check LP_DEPLOYER_PRIVATE_KEY
if [ -z "$LP_DEPLOYER_PRIVATE_KEY" ]; then
    echo "❌ LP_DEPLOYER_PRIVATE_KEY - Not set (required for deploying LP)"
else
    echo "✅ LP_DEPLOYER_PRIVATE_KEY - Set"
fi

echo ""
echo "Optional variables:"
echo "===================="

# Check NETWORK
if [ -z "$NETWORK" ]; then
    echo "⚠️  NETWORK - Not set (will default to 'baseSepolia')"
else
    echo "✅ NETWORK - Set to '$NETWORK'"
fi

# Check RPC_URL
if [ -z "$RPC_URL" ]; then
    echo "⚠️  RPC_URL - Not set (will use default RPC)"
else
    echo "✅ RPC_URL - Set"
fi

echo ""

# Check if all required are set
if [ -z "$DATABASE_URL" ] || [ -z "$PRIVATE_KEY" ] || [ -z "$LP_DEPLOYER_PRIVATE_KEY" ]; then
    echo "❌ Missing required environment variables!"
    echo ""
    echo "Please set them in your .env file:"
    echo ""
    echo "DATABASE_URL=postgresql://user:pass@localhost:5432/dbname"
    echo "PRIVATE_KEY=0x..."
    echo "LP_DEPLOYER_PRIVATE_KEY=0x..."
    echo ""
    exit 1
else
    echo "✅ All required environment variables are set!"
    echo ""
    echo "You can now run:"
    echo "  npm run lp-deployer"
    echo ""
    exit 0
fi

