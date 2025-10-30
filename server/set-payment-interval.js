#!/usr/bin/env node
/**
 * Set payment queue batch interval
 * Usage: node set-payment-interval.js [milliseconds]
 */

const { Pool } = require('pg');
require('dotenv').config();

async function main() {
    const ms = process.argv[2];

    if (!ms || isNaN(ms) || parseInt(ms) < 100) {
        console.error('\n❌ Usage: node set-payment-interval.js <milliseconds>');
        console.error('\nExample:');
        console.error('   node set-payment-interval.js 2000   # Set to 2000ms (2 seconds)');
        console.error('   node set-payment-interval.js 500    # Set to 500ms (faster)');
        console.error('\n💡 Minimum: 100ms (recommended: 1000-2000ms)\n');
        process.exit(1);
    }

    const intervalMs = parseInt(ms);

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? {
            rejectUnauthorized: false
        } : false,
    });

    try {
        console.log(`\n⚙️  Setting payment queue interval to ${intervalMs}ms...\n`);

        // Update setting
        const result = await pool.query(`
      UPDATE system_settings
      SET value = $1, updated_at = NOW()
      WHERE key = 'payment_batch_interval_ms'
      RETURNING key, value, updated_at
    `, [intervalMs.toString()]);

        if (result.rows.length === 0) {
            console.log('⚠️  Setting not found, creating...');
            await pool.query(`
        INSERT INTO system_settings (key, value, description)
        VALUES ('payment_batch_interval_ms', $1, 'Milliseconds between payment queue batch operations')
      `, [intervalMs.toString()]);
            console.log('✅ Setting created');
        } else {
            console.log('✅ Setting updated:');
            console.log(`   Value: ${result.rows[0].value}ms (${(intervalMs / 1000).toFixed(2)}s)`);
            console.log(`   Updated: ${result.rows[0].updated_at}`);
        }

        console.log(`\n⏱️  Payment queue will now process every ${intervalMs}ms`);

        if (intervalMs < 1000) {
            console.log('\n⚠️  WARNING: Intervals < 1000ms may cause high load!');
        }

        console.log('\n⚠️  IMPORTANT: Restart the service for changes to take effect:');
        console.log('   pm2 restart all');
        console.log('   # or');
        console.log('   npm run dev:multi-token\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();

