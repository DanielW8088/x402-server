#!/usr/bin/env node
/**
 * Set queue batch interval
 * Usage: node set-queue-interval.js [seconds]
 */

const { Pool } = require('pg');
require('dotenv').config();

async function main() {
    const seconds = process.argv[2];

    if (!seconds || isNaN(seconds) || parseInt(seconds) < 1) {
        console.error('\n❌ Usage: node set-queue-interval.js <seconds>');
        console.error('\nExample:');
        console.error('   node set-queue-interval.js 2   # Set to 2 seconds\n');
        process.exit(1);
    }

    const intervalSeconds = parseInt(seconds);

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? {
            rejectUnauthorized: false
        } : false,
    });

    try {
        console.log(`\n⚙️  Setting queue interval to ${intervalSeconds} seconds...\n`);

        // Update setting
        const result = await pool.query(`
      UPDATE system_settings
      SET value = $1, updated_at = NOW()
      WHERE key = 'batch_interval_seconds'
      RETURNING key, value, updated_at
    `, [intervalSeconds.toString()]);

        if (result.rows.length === 0) {
            console.log('⚠️  Setting not found, creating...');
            await pool.query(`
        INSERT INTO system_settings (key, value, description)
        VALUES ('batch_interval_seconds', $1, 'Seconds between batch mint operations')
      `, [intervalSeconds.toString()]);
            console.log('✅ Setting created');
        } else {
            console.log('✅ Setting updated:');
            console.log(`   Value: ${result.rows[0].value} seconds`);
            console.log(`   Updated: ${result.rows[0].updated_at}`);
        }

        console.log(`\n⏱️  Queue will now process every ${intervalSeconds} seconds (${intervalSeconds * 1000}ms)`);
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

