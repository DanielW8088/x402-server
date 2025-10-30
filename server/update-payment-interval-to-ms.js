#!/usr/bin/env node
/**
 * Update payment_batch_interval_seconds to payment_batch_interval_ms
 * Converts existing seconds value to milliseconds
 */

const { Pool } = require('pg');
require('dotenv').config();

async function main() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? {
            rejectUnauthorized: false
        } : false,
    });

    try {
        console.log('\n⚙️  Updating payment queue interval from seconds to milliseconds...\n');

        // Check if old key exists
        const checkOld = await pool.query(`
      SELECT value FROM system_settings WHERE key = 'payment_batch_interval_seconds'
    `);

        let newValue = '2000'; // default 2000ms

        if (checkOld.rows.length > 0) {
            const oldSeconds = parseInt(checkOld.rows[0].value);
            newValue = (oldSeconds * 1000).toString();
            console.log(`   Found old setting: ${oldSeconds}s → converting to ${newValue}ms`);

            // Delete old key
            await pool.query(`
        DELETE FROM system_settings WHERE key = 'payment_batch_interval_seconds'
      `);
            console.log('   ✅ Removed old setting');
        } else {
            console.log('   No old setting found, using default 2000ms');
        }

        // Check if new key exists
        const checkNew = await pool.query(`
      SELECT value FROM system_settings WHERE key = 'payment_batch_interval_ms'
    `);

        if (checkNew.rows.length > 0) {
            console.log(`   ✅ New setting already exists: ${checkNew.rows[0].value}ms`);
        } else {
            // Insert new key
            await pool.query(`
        INSERT INTO system_settings (key, value, description)
        VALUES ('payment_batch_interval_ms', $1, 'Interval in milliseconds for processing payment queue batches (prevents nonce conflicts)')
      `, [newValue]);
            console.log(`   ✅ Created new setting: ${newValue}ms`);
        }

        console.log('\n✅ Migration complete!');
        console.log('\n⚠️  Restart the service for changes to take effect:');
        console.log('   pm2 restart all\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();

