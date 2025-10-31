#!/bin/bash

# Setup User Points & Invitation System
# This script sets up the complete user management system

set -e

echo "🚀 Setting up User Points & Invitation System"
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL environment variable is not set"
    echo ""
    echo "Please set DATABASE_URL and try again:"
    echo "  export DATABASE_URL='postgresql://user:password@host:port/database'"
    exit 1
fi

echo "📊 Database: ${DATABASE_URL%%@*}@***"
echo ""

# Step 1: Create users table
echo "📝 Step 1/2: Creating users table and indexes..."
psql "$DATABASE_URL" -f db/migrations/005_add_users_and_points.sql

if [ $? -eq 0 ]; then
    echo "✅ Users table created successfully"
else
    echo "❌ Failed to create users table"
    exit 1
fi

echo ""

# Step 2: Migrate historical data
echo "📝 Step 2/2: Migrating historical mint data..."
psql "$DATABASE_URL" -f scripts/migrate-historical-mints.sql

if [ $? -eq 0 ]; then
    echo "✅ Historical data migrated successfully"
else
    echo "❌ Failed to migrate historical data"
    exit 1
fi

echo ""
echo "🎉 User Points & Invitation System setup complete!"
echo ""
echo "📖 Next steps:"
echo "  1. Restart your server to enable the new APIs"
echo "  2. Read USER_POINTS_GUIDE.md for API documentation"
echo "  3. Test the APIs with: curl http://localhost:4021/api/leaderboard"
echo ""

