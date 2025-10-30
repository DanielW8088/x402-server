#!/usr/bin/env node
/**
 * Diagnose payment_queue and mint_queue mismatch
 * Find cases where payment failed but mint queue was still created
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
        console.log('\n🔍 Checking for payment/mint queue mismatches...\n');

        // 1. Count payment queue status
        const paymentStats = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM payment_queue
      GROUP BY status
      ORDER BY status
    `);

        console.log('📊 Payment Queue Status:');
        paymentStats.rows.forEach(row => {
            console.log(`   ${row.status}: ${row.count}`);
        });

        // 2. Count mint queue status
        const mintStats = await pool.query(`
      SELECT status, COUNT(*) as count
      FROM mint_queue
      GROUP BY status
      ORDER BY status
    `);

        console.log('\n📊 Mint Queue Status:');
        mintStats.rows.forEach(row => {
            console.log(`   ${row.status}: ${row.count}`);
        });

        // 3. Find orphaned mint queue items (no corresponding payment)
        const orphanedMints = await pool.query(`
      SELECT 
        mq.id,
        mq.payer_address,
        mq.token_address,
        mq.status as mint_status,
        mq.payment_tx_hash,
        mq.created_at,
        pq.id as payment_id,
        pq.status as payment_status
      FROM mint_queue mq
      LEFT JOIN payment_queue pq 
        ON pq.payer = mq.payer_address 
        AND pq.token_address = mq.token_address
        AND pq.created_at BETWEEN mq.created_at - INTERVAL '1 minute' AND mq.created_at + INTERVAL '1 minute'
      WHERE mq.status = 'pending'
      AND mq.created_at > NOW() - INTERVAL '1 hour'
      ORDER BY mq.created_at DESC
      LIMIT 20
    `);

        if (orphanedMints.rows.length > 0) {
            console.log('\n⚠️  Found mint queue items (recent 1 hour):');
            orphanedMints.rows.forEach(row => {
                console.log(`   Mint ID: ${row.id.slice(0, 8)}`);
                console.log(`     Payer: ${row.payer_address}`);
                console.log(`     Mint Status: ${row.mint_status}`);
                console.log(`     Payment Status: ${row.payment_status || 'NOT FOUND'}`);
                console.log(`     Created: ${row.created_at}`);
                console.log('');
            });
        }

        // 4. Find failed payments with successful mints (THIS IS THE BUG!)
        const failedPaymentsWithMints = await pool.query(`
      SELECT 
        pq.id as payment_id,
        pq.payer,
        pq.token_address,
        pq.status as payment_status,
        pq.error as payment_error,
        pq.created_at as payment_created,
        COUNT(mq.id) as mint_count,
        COUNT(CASE WHEN mq.status = 'completed' THEN 1 END) as completed_mints
      FROM payment_queue pq
      LEFT JOIN mint_queue mq 
        ON mq.payer_address = pq.payer 
        AND mq.token_address = pq.token_address
        AND mq.created_at BETWEEN pq.created_at - INTERVAL '1 minute' AND pq.created_at + INTERVAL '1 minute'
      WHERE pq.status = 'failed'
      AND pq.created_at > NOW() - INTERVAL '24 hours'
      GROUP BY pq.id, pq.payer, pq.token_address, pq.status, pq.error, pq.created_at
      HAVING COUNT(mq.id) > 0
      ORDER BY pq.created_at DESC
      LIMIT 10
    `);

        if (failedPaymentsWithMints.rows.length > 0) {
            console.log('\n🚨 CRITICAL: Found failed payments with mint queue items!');
            failedPaymentsWithMints.rows.forEach(row => {
                console.log(`   Payment ID: ${row.payment_id.slice(0, 8)}`);
                console.log(`     Payer: ${row.payer}`);
                console.log(`     Status: ${row.payment_status}`);
                console.log(`     Error: ${row.payment_error}`);
                console.log(`     Mint Items: ${row.mint_count} (${row.completed_mints} completed)`);
                console.log(`     Created: ${row.payment_created}`);
                console.log('');
            });

            console.log('💡 Recommendation: Clean up these orphaned mint queue items');
        } else {
            console.log('\n✅ No failed payments with mint queue items found (last 24h)');
        }

        // 5. Find pending payments older than 5 minutes (likely stuck)
        const stuckPayments = await pool.query(`
      SELECT id, payer, status, created_at,
        EXTRACT(EPOCH FROM (NOW() - created_at)) as age_seconds
      FROM payment_queue
      WHERE status = 'pending'
      AND created_at < NOW() - INTERVAL '5 minutes'
      ORDER BY created_at ASC
      LIMIT 10
    `);

        if (stuckPayments.rows.length > 0) {
            console.log('\n⏰ Found stuck pending payments (>5 minutes old):');
            stuckPayments.rows.forEach(row => {
                console.log(`   ID: ${row.id.slice(0, 8)} | Age: ${Math.floor(row.age_seconds)}s | Payer: ${row.payer.slice(0, 8)}...`);
            });
        }

        console.log('\n✅ Diagnosis complete\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();

