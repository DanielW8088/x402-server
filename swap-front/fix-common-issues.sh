#!/bin/bash

# Auto-fix script for common issues

echo "🔧 Liquidity Manager - Auto Fix Tool"
echo "===================================="
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check Node.js
if ! command_exists node; then
    echo "❌ Node.js not found. Please install Node.js from https://nodejs.org"
    exit 1
fi

echo "✅ Node.js: $(node -v)"

# Check for common issues
ISSUES_FOUND=0

# Issue 1: Missing node_modules
if [ ! -d "node_modules" ]; then
    echo ""
    echo "⚠️  Issue: node_modules not found"
    echo "   Fixing: Installing dependencies..."
    npm install
    if [ $? -eq 0 ]; then
        echo "✅ Fixed: Dependencies installed"
    else
        echo "❌ Failed to install dependencies"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
fi

# Issue 2: Missing .env.local
if [ ! -f ".env.local" ]; then
    echo ""
    echo "⚠️  Issue: .env.local not found"
    echo "   Fixing: Creating .env.local template..."
    cat > .env.local << 'EOF'
# WalletConnect Project ID (REQUIRED)
# Get yours at: https://cloud.walletconnect.com
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# Network (optional)
NEXT_PUBLIC_DEFAULT_NETWORK=base
EOF
    echo "✅ Created: .env.local"
    echo ""
    echo "📝 ACTION REQUIRED: Edit .env.local and add your WalletConnect Project ID"
    echo "   Get it free at: https://cloud.walletconnect.com"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Issue 3: Empty WalletConnect Project ID
if [ -f ".env.local" ] && grep -q "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=$" .env.local; then
    echo ""
    echo "⚠️  Issue: WalletConnect Project ID not set"
    echo "   Please edit .env.local and add your Project ID"
    echo "   Get it free at: https://cloud.walletconnect.com"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Issue 4: Stale Next.js cache
if [ -d ".next" ]; then
    echo ""
    echo "🧹 Cleaning Next.js cache..."
    rm -rf .next
    echo "✅ Cache cleared"
fi

# Issue 5: Check for common port conflicts
if command_exists lsof; then
    PORT_IN_USE=$(lsof -ti:3003 2>/dev/null)
    if [ ! -z "$PORT_IN_USE" ]; then
        echo ""
        echo "⚠️  Issue: Port 3003 is already in use"
        echo "   Process ID: $PORT_IN_USE"
        echo "   Options:"
        echo "   1. Kill the process: kill $PORT_IN_USE"
        echo "   2. Or run on different port: npm run dev -- -p 3004"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
fi

# Summary
echo ""
echo "=================================="
if [ $ISSUES_FOUND -eq 0 ]; then
    echo "✅ No issues found!"
    echo ""
    echo "Ready to start:"
    echo "  npm run dev"
else
    echo "⚠️  Found $ISSUES_FOUND issue(s) requiring attention"
    echo ""
    echo "After fixing the issues above, run:"
    echo "  npm run dev"
fi
echo "=================================="
echo ""

# Offer to start dev server
if [ $ISSUES_FOUND -eq 0 ]; then
    read -p "Start development server now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo ""
        echo "Starting development server..."
        echo "Open http://localhost:3003 in your browser"
        echo ""
        npm run dev
    fi
fi

