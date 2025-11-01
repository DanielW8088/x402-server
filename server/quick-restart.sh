#!/bin/bash
# Quick restart to fix nonce issues without cleaning queue
# Use this when you just need to reset NonceManager cache

echo ""
echo "⚡ Quick Restart (Nonce Cache Reset)"
echo "====================================="
echo ""

echo "🔄 Restarting services..."
pm2 restart token-server lp-deployer

echo ""
echo "✅ Services restarted!"
echo ""
echo "📊 Monitor logs to verify nonce sync:"
echo "   pm2 logs token-server --lines 20"
echo ""
echo "🔍 Look for:"
echo "   ✅ NonceManager initialized, starting nonce: XXXX"
echo "   🔄 Synced nonce from chain: XXXX (pending)"
echo ""

