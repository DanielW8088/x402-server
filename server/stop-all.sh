#!/bin/bash

# Stop all PM2 services
# Usage: ./stop-all.sh

echo "🛑 Stopping all services..."

pm2 stop all

echo ""
echo "✅ All services stopped!"
echo ""
echo "📊 Status:"
pm2 status

echo ""
echo "💡 To completely remove:"
echo "   pm2 delete all"
echo ""

