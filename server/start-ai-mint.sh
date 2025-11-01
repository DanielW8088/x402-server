#!/bin/bash
# 🤖 AI Mint Executor - 快速启动脚本

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║       AI Mint Executor - Quick Start                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if in server directory
if [ ! -f "package.json" ]; then
  echo "❌ Error: Please run this script from the server directory"
  exit 1
fi

# Step 1: Build
echo "📦 Step 1: Building TypeScript..."
npm run build

if [ $? -ne 0 ]; then
  echo "❌ Build failed"
  exit 1
fi
echo "✅ Build successful"
echo ""

# Step 2: Check environment
echo "🔧 Step 2: Checking environment..."

if [ ! -f ".env" ]; then
  echo "❌ Error: .env file not found"
  echo "💡 Run: cp env.multi-token.example .env"
  exit 1
fi

if [ -z "$DATABASE_URL" ]; then
  source .env
fi

if [ -z "$DATABASE_URL" ]; then
  echo "❌ Error: DATABASE_URL not set in .env"
  exit 1
fi

echo "✅ Environment OK"
echo ""

# Step 3: Check private key file
echo "🔐 Step 3: Checking private key file..."

if [ -f "$HOME/.config/token-mint/private.key" ]; then
  PRIVATE_KEY_FILE="$HOME/.config/token-mint/private.key"
elif [ -f "/etc/secret/private.key" ]; then
  PRIVATE_KEY_FILE="/etc/secret/private.key"
else
  echo "❌ Error: Private key file not found"
  echo "💡 See: docs/PRIVATE_KEY_SETUP.md"
  exit 1
fi

echo "✅ Private key file found: $PRIVATE_KEY_FILE"
echo ""

# Step 4: Start services
echo "🚀 Step 4: Starting services..."
echo ""

echo "Starting main server..."
pm2 start ecosystem.config.cjs 2>/dev/null || pm2 restart ecosystem.config.cjs

echo "Starting AI Mint Executor..."
pm2 start ecosystem.ai-mint.cjs 2>/dev/null || pm2 restart ecosystem.ai-mint.cjs

echo ""
echo "✅ Services started!"
echo ""

# Step 5: Show status
echo "📊 Status:"
pm2 status

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                     🎉 ALL DONE!                          ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "📖 Commands:"
echo "   pm2 logs ai-mint-executor     # View logs"
echo "   pm2 restart ai-mint-executor  # Restart service"
echo "   pm2 stop ai-mint-executor     # Stop service"
echo "   pm2 delete ai-mint-executor   # Remove service"
echo ""
echo "📚 Documentation:"
echo "   server/AI_MINT_EXECUTOR_GUIDE.md"
echo "   server/AI_MINT_IMPLEMENTATION_SUMMARY.md"
echo ""
echo "🔗 API Endpoints:"
echo "   POST   /api/ai-agent/chat"
echo "   POST   /api/ai-agent/task/:taskId/fund"
echo "   GET    /api/ai-agent/tasks/:address"
echo "   GET    /api/ai-agent/task/:taskId"
echo ""

