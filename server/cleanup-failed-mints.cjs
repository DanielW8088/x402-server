#!/usr/bin/env node
/**
 * Cleanup orphaned mint queue items from failed payments
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
        console.log('\n🧹 Cleaning up orphaned mint queue items...\n');

        // Find and mark as failed: mint queue items where payment failed
        const result = await pool.query(`
      WITH failed_payment_mints AS (
        SELECT DISTINCT
          mq.id as mint_id,
          pq.error as payment_error
        FROM payment_queue pq
        INNER JOIN mint_queue mq 
          ON mq.payer_address = pq.payer 
          AND mq.token_address = pq.token_address
          AND mq.created_at BETWEEN pq.created_at - INTERVAL '1 minute' AND pq.created_at + INTERVAL '1 minute'
        WHERE pq.status = 'failed'
        AND mq.status IN ('pending', 'processing')
      )
      UPDATE mint_queue mq
      SET 
        status = 'failed',
        error_message = 'Payment failed: ' || COALESCE(fpm.payment_error, 'Unknown payment error'),
        updated_at = NOW()
      FROM failed_payment_mints fpm
      WHERE mq.id = fpm.mint_id
      RETURNING mq.id, mq.payer_address, mq.error_message
    `);

        if (result.rows.length > 0) {
            console.log(`✅ Marked ${result.rows.length} mint queue items as failed:`);
            result.rows.forEach((row, i) => {
                if (i < 5) { // Show first 5
                    console.log(`   ${row.id.slice(0, 8)} | ${row.payer_address.slice(0, 8)}... | ${row.error_message.slice(0, 50)}...`);
                }
            });
            if (result.rows.length > 5) {
                console.log(`   ... and ${result.rows.length - 5} more`);
            }
        } else {
            console.log('✅ No orphaned mint queue items found');
        }

        console.log('\n✅ Cleanup complete\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();

