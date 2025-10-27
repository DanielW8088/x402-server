#!/bin/bash

# Setup PostgreSQL database for token mint queue system

set -e

echo "🗄️  Token Mint Queue - Database Setup"
echo "===================================="
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL not set in environment"
  echo ""
  echo "Please set DATABASE_URL environment variable:"
  echo "export DATABASE_URL=postgresql://user:password@localhost:5432/token_mint"
  echo ""
  echo "Or add to .env file:"
  echo "DATABASE_URL=postgresql://user:password@localhost:5432/token_mint"
  exit 1
fi

echo "✓ DATABASE_URL found"
echo ""

# Check if psql is installed
if ! command -v psql &> /dev/null; then
  echo "❌ psql not found. Please install PostgreSQL client."
  echo ""
  echo "macOS: brew install postgresql@14"
  echo "Ubuntu: sudo apt install postgresql-client"
  exit 1
fi

echo "✓ PostgreSQL client found"
echo ""

# Extract database info from URL
DB_URL_REGEX="postgresql://([^:]+):([^@]+)@([^:]+):([^/]+)/(.*)"
if [[ $DATABASE_URL =~ $DB_URL_REGEX ]]; then
  DB_USER="${BASH_REMATCH[1]}"
  DB_PASS="${BASH_REMATCH[2]}"
  DB_HOST="${BASH_REMATCH[3]}"
  DB_PORT="${BASH_REMATCH[4]}"
  DB_NAME="${BASH_REMATCH[5]}"
else
  echo "❌ Invalid DATABASE_URL format"
  echo "Expected: postgresql://user:password@host:port/database"
  exit 1
fi

echo "Database: $DB_NAME"
echo "Host: $DB_HOST:$DB_PORT"
echo "User: $DB_USER"
echo ""

# Test connection
echo "Testing database connection..."
export PGPASSWORD="$DB_PASS"

if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" &> /dev/null; then
  echo "✅ Connection successful"
else
  echo "❌ Connection failed"
  echo ""
  echo "Possible solutions:"
  echo "1. Check PostgreSQL is running: brew services list (macOS) or systemctl status postgresql (Linux)"
  echo "2. Create database: psql postgres -c \"CREATE DATABASE $DB_NAME;\""
  echo "3. Create user: psql postgres -c \"CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';\""
  echo "4. Grant privileges: psql postgres -c \"GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;\""
  exit 1
fi

echo ""
echo "Initializing database schema..."
echo ""

# Run schema initialization
psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$(dirname "$0")/../db/schema.sql"

echo ""
echo "✅ Database setup complete!"
echo ""
echo "You can now start the server:"
echo "npm run dev:queue"
echo ""

