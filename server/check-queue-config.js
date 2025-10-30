#!/usr/bin/env node
/**
 * Check queue configuration from database
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
        console.log('\n🔍 Checking queue configuration...\n');

        // Check database settings
        const result = await pool.query(`
      SELECT key, value, description, updated_at
      FROM system_settings
      WHERE key IN ('batch_interval_seconds', 'max_batch_size')
      ORDER BY key
    `);

        if (result.rows.length === 0) {
            console.log('❌ No queue settings found in database!');
            console.log('\n💡 Run this to fix:');
            console.log(`   npm run db:init\n`);
            process.exit(1);
        }

        console.log('📊 Current database settings:\n');
        result.rows.forEach(row => {
            console.log(`   ${row.key}:`);
            console.log(`      Value: ${row.value}`);
            console.log(`      Description: ${row.description}`);
            console.log(`      Updated: ${row.updated_at}`);
            console.log('');
        });

        // Calculate actual interval
        const batchSetting = result.rows.find(r => r.key === 'batch_interval_seconds');
        if (batchSetting) {
            const seconds = parseInt(batchSetting.value);
            const milliseconds = seconds * 1000;
            console.log(`⏱️  Queue will process every ${seconds} seconds (${milliseconds}ms)\n`);
        }

        console.log('✅ Configuration check complete');
        console.log('\n💡 To apply changes, restart the service:');
        console.log('   pm2 restart all\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();

