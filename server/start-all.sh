#!/bin/bash

# Start all services using PM2
# Usage: ./start-all.sh

set -e

echo "🚀 Starting all services with PM2..."

# Create logs directory if not exists
mkdir -p logs

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2 not found. Installing..."
    npm install -g pm2
fi

# Stop existing processes (ignore errors)
pm2 delete all 2>/dev/null || true

# Start with ecosystem config
pm2 start ecosystem.config.js

# Save PM2 process list
pm2 save

# Setup PM2 to start on system boot (optional)
# pm2 startup

echo ""
echo "✅ All services started!"
echo ""
echo "📊 Status:"
pm2 status

echo ""
echo "📝 Useful commands:"
echo "   pm2 logs              - View all logs"
echo "   pm2 logs token-server - View server logs"
echo "   pm2 logs lp-deployer  - View LP deployer logs"
echo "   pm2 status            - Check status"
echo "   pm2 restart all       - Restart all"
echo "   pm2 stop all          - Stop all"
echo "   pm2 delete all        - Delete all"
echo ""

