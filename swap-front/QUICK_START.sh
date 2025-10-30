#!/bin/bash

# Liquidity Manager - Quick Start Script

echo "🚀 Liquidity Manager - Quick Start"
echo "=================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed!"
    echo "   Please install Node.js from https://nodejs.org"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"
echo ""

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed!"
    exit 1
fi

echo "✅ npm version: $(npm -v)"
echo ""

# Check if .env.local exists
if [ ! -f ".env.local" ]; then
    echo "⚠️  .env.local not found!"
    echo ""
    echo "Creating .env.local template..."
    cat > .env.local << 'EOF'
# WalletConnect Project ID (REQUIRED)
# Get yours at: https://cloud.walletconnect.com
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=

# Network (optional)
NEXT_PUBLIC_DEFAULT_NETWORK=base
EOF
    echo "✅ Created .env.local"
    echo ""
    echo "📝 Please edit .env.local and add your WalletConnect Project ID"
    echo "   Get it free at: https://cloud.walletconnect.com"
    echo ""
    read -p "Press Enter after you've added your Project ID..."
    echo ""
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies"
        exit 1
    fi
    
    echo "✅ Dependencies installed"
    echo ""
fi

# Check if .env.local has Project ID
if grep -q "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=$" .env.local; then
    echo "⚠️  WalletConnect Project ID is not set in .env.local"
    echo ""
    echo "You can still run the app, but wallet connection may not work."
    echo "Get your free Project ID at: https://cloud.walletconnect.com"
    echo ""
fi

echo "🎉 Setup complete!"
echo ""
echo "Starting development server..."
echo "Open http://localhost:3003 in your browser"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

# Start the dev server
npm run dev

