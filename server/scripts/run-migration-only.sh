#!/bin/bash

# Run only the users table migration (without historical data)
# Useful if you want to test the schema first

set -e

echo "🚀 Running Users Table Migration"
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
echo "📝 Creating users table and indexes..."
psql "$DATABASE_URL" -f db/migrations/005_add_users_and_points.sql

if [ $? -eq 0 ]; then
    echo "✅ Migration completed successfully"
    echo ""
    echo "💡 Next step: Run historical data migration"
    echo "  ./scripts/migrate-historical-data.sh"
else
    echo "❌ Migration failed"
    exit 1
fi

