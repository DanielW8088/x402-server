#!/usr/bin/env node

/**
 * Apply payment queue migration
 * Run: node apply-payment-queue-migration.js
 */

const { Pool } = require('pg');
const { readFileSync } = require('fs');
const { config } = require('dotenv');

config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
    console.error('❌ DATABASE_URL not set');
    process.exit(1);
}

const pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.DB_SSL_ENABLED !== 'false' ? {
        rejectUnauthorized: false
    } : false,
});

async function applyMigration() {
    console.log('🔄 Applying payment queue migration...\n');

    const client = await pool.connect();

    try {
        // Read migration SQL
        const migrationSQL = readFileSync('./db/migrations/004_add_payment_queue.sql', 'utf8');

        // Execute migration
        await client.query(migrationSQL);

        console.log('✅ Payment queue migration applied successfully!\n');
        console.log('📊 New features:');
        console.log('   - Payment queue for serial USDC transaction processing');
        console.log('   - Automatic nonce management (no more nonce conflicts!)');
        console.log('   - Payment status tracking via /api/payment/:paymentId');
        console.log('   - Payment queue stats via /api/payment/stats\n');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        client.release();
        await pool.end();
    }
}

applyMigration();

