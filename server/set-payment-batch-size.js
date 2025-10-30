#!/usr/bin/env node
/**
 * Set payment queue batch size (number of payments to process in parallel)
 * Usage: node set-payment-batch-size.js [size]
 */

const { Pool } = require('pg');
require('dotenv').config();

async function main() {
    const size = process.argv[2];

    if (!size || isNaN(size) || parseInt(size) < 1) {
        console.error('\n❌ Usage: node set-payment-batch-size.js <size>');
        console.error('\nExample:');
        console.error('   node set-payment-batch-size.js 10   # Process 10 payments in parallel');
        console.error('   node set-payment-batch-size.js 20   # Process 20 payments in parallel');
        console.error('   node set-payment-batch-size.js 50   # Process 50 payments in parallel');
        console.error('\n💡 Recommended: 10-50 (higher = faster but more gas and risk)\n');
        process.exit(1);
    }

    const batchSize = parseInt(size);

    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? {
            rejectUnauthorized: false
        } : false,
    });

    try {
        console.log(`\n⚙️  Setting payment queue batch size to ${batchSize}...\n`);

        // Update setting
        const result = await pool.query(`
      UPDATE system_settings
      SET value = $1, updated_at = NOW()
      WHERE key = 'payment_batch_size'
      RETURNING key, value, updated_at
    `, [batchSize.toString()]);

        if (result.rows.length === 0) {
            console.log('⚠️  Setting not found, creating...');
            await pool.query(`
        INSERT INTO system_settings (key, value, description)
        VALUES ('payment_batch_size', $1, 'Number of payments to process in parallel per batch')
      `, [batchSize.toString()]);
            console.log('✅ Setting created');
        } else {
            console.log('✅ Setting updated:');
            console.log(`   Batch Size: ${result.rows[0].value} payments`);
            console.log(`   Updated: ${result.rows[0].updated_at}`);
        }

        console.log(`\n🚀 Payment queue will now process ${batchSize} payments in parallel per batch`);

        if (batchSize > 50) {
            console.log('\n⚠️  WARNING: Batch size > 50 may cause:');
            console.log('   - High gas costs if many fail');
            console.log('   - Risk of RPC rate limits');
            console.log('   - Consider testing with smaller batches first');
        }

        if (batchSize === 1) {
            console.log('\n💡 INFO: Batch size of 1 means serial processing (one at a time)');
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


