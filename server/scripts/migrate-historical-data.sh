#!/bin/bash

# Migrate historical mint data to users table
# Run this AFTER creating the users table

set -e

echo "🚀 Migrating Historical Mint Data"
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

# Run migration
echo "📝 Migrating historical mint data..."
psql "$DATABASE_URL" -f scripts/migrate-historical-mints.sql

if [ $? -eq 0 ]; then
    echo "✅ Historical data migration completed successfully"
    echo ""
    echo "💡 Next step: Restart your server"
    echo "  npm run dev"
else
    echo "❌ Migration failed"
    exit 1
fi

