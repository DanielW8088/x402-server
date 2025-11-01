#!/bin/bash
# Rebuild and restart services with recipient fix

echo "🔧 Rebuilding TypeScript..."
cd /Users/daniel/code/402/token-mint/server

# Build TypeScript
npm run build

if [ $? -ne 0 ]; then
  echo "❌ Build failed!"
  exit 1
fi

echo "✅ Build successful!"

echo ""
echo "🔄 Restarting services..."

# Restart main server
pm2 restart token-mint-server 2>/dev/null || echo "⚠️  token-mint-server not running"

# Restart AI mint executor
pm2 restart ai-mint-executor 2>/dev/null || echo "⚠️  ai-mint-executor not running"

echo ""
echo "📋 Service status:"
pm2 list

echo ""
echo "✅ Services restarted!"
echo ""
echo "📝 To view logs:"
echo "   Server logs:   pm2 logs token-mint-server"
echo "   Executor logs: pm2 logs ai-mint-executor"

