#!/usr/bin/env node
/**
 * Check for duplicate mints (same payment but multiple mint queue entries)
 * This detects the "收1U发2次mint" bug
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
        console.log('\n🔍 Checking for duplicate mints (same payment, multiple mints)...\n');

        // 1. Check for payments with multiple associated mints
        const duplicateMints = await pool.query(`
      SELECT 
        payment_tx_hash,
        payer_address,
        token_address,
        COUNT(*) as mint_count,
        array_agg(id) as queue_ids,
        array_agg(status) as statuses,
        array_agg(tx_hash_bytes32) as tx_hashes,
        MIN(created_at) as first_created,
        MAX(created_at) as last_created
      FROM mint_queue
      WHERE payment_tx_hash IS NOT NULL
      GROUP BY payment_tx_hash, payer_address, token_address
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC, MIN(created_at) DESC
      LIMIT 50
    `);

        if (duplicateMints.rows.length > 0) {
            console.log(`🚨 Found ${duplicateMints.rows.length} payments with multiple mints:\n`);

            duplicateMints.rows.forEach((row, i) => {
                console.log(`${i + 1}. Payment TX: ${row.payment_tx_hash.slice(0, 10)}...`);
                console.log(`   Payer: ${row.payer_address}`);
                console.log(`   Mint Count: ${row.mint_count} (⚠️ expected 1 for 1U payment)`);
                console.log(`   Statuses: ${row.statuses.join(', ')}`);
                console.log(`   Time Range: ${row.first_created.toISOString()} - ${row.last_created.toISOString()}`);
                console.log(`   Time Diff: ${Math.floor((new Date(row.last_created) - new Date(row.first_created)) / 1000)}s`);
                console.log('');
            });

            // Calculate total overcharged mints
            const totalDuplicates = duplicateMints.rows.reduce((sum, row) => {
                return sum + (parseInt(row.mint_count) - 1); // -1 because first mint is legitimate
            }, 0);

            console.log(`⚠️  Total duplicate mints: ${totalDuplicates}`);
            console.log(`💰 If each mint = 1U, users received ${totalDuplicates} extra mints for free\n`);
        } else {
            console.log('✅ No duplicate mints found (payments with multiple mint queue entries)\n');
        }

        // 2. Check mint_history for duplicates
        const historyDuplicates = await pool.query(`
      SELECT 
        payment_tx_hash,
        payer_address,
        COUNT(*) as mint_count,
        array_agg(id) as history_ids,
        array_agg(tx_hash_bytes32) as tx_hashes
      FROM mint_history
      WHERE payment_tx_hash IS NOT NULL
      GROUP BY payment_tx_hash, payer_address
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
      LIMIT 20
    `);

        if (historyDuplicates.rows.length > 0) {
            console.log(`\n🚨 Found ${historyDuplicates.rows.length} completed payments with multiple mints:\n`);

            historyDuplicates.rows.forEach((row, i) => {
                console.log(`${i + 1}. Payment TX: ${row.payment_tx_hash.slice(0, 10)}...`);
                console.log(`   Payer: ${row.payer_address}`);
                console.log(`   Mint Count: ${row.mint_count}`);
                console.log('');
            });
        } else {
            console.log('✅ No duplicate mints in history\n');
        }

        // 3. Check for pattern: traditional payment mode duplicates
        const traditionalDuplicates = await pool.query(`
      SELECT 
        pq.id as payment_id,
        pq.payer,
        pq.token_address,
        pq.metadata,
        pq.tx_hash as payment_tx,
        pq.created_at as payment_created,
        COUNT(mq.id) as mint_count,
        array_agg(mq.id) as mint_queue_ids
      FROM payment_queue pq
      INNER JOIN mint_queue mq 
        ON mq.payment_tx_hash = pq.tx_hash
      WHERE pq.payment_type = 'mint'
      AND pq.status = 'completed'
      GROUP BY pq.id, pq.payer, pq.token_address, pq.metadata, pq.tx_hash, pq.created_at
      HAVING COUNT(mq.id) > CAST(pq.metadata->>'quantity' AS INTEGER)
      ORDER BY pq.created_at DESC
      LIMIT 10
    `);

        if (traditionalDuplicates.rows.length > 0) {
            console.log(`\n🚨 Found ${traditionalDuplicates.rows.length} traditional payments with too many mints:\n`);

            traditionalDuplicates.rows.forEach((row, i) => {
                const expectedQuantity = row.metadata.quantity;
                console.log(`${i + 1}. Payment ID: ${row.payment_id.slice(0, 8)}`);
                console.log(`   Payer: ${row.payer}`);
                console.log(`   Expected: ${expectedQuantity} mints`);
                console.log(`   Actual: ${row.mint_count} mints ⚠️`);
                console.log(`   Overcharged: ${row.mint_count - expectedQuantity} extra mints`);
                console.log('');
            });
        } else {
            console.log('✅ No traditional payment duplicates found\n');
        }

        // 4. Statistics
        console.log('\n📊 Summary Statistics:\n');

        const stats = await pool.query(`
      SELECT 
        COUNT(DISTINCT payment_tx_hash) as total_payments_with_mints,
        COUNT(*) as total_mints,
        AVG(mint_per_payment) as avg_mints_per_payment
      FROM (
        SELECT 
          payment_tx_hash,
          COUNT(*) as mint_per_payment
        FROM mint_queue
        WHERE payment_tx_hash IS NOT NULL
        GROUP BY payment_tx_hash
      ) subq
    `);

        if (stats.rows.length > 0) {
            const { total_payments_with_mints, total_mints, avg_mints_per_payment } = stats.rows[0];
            console.log(`   Total Payments: ${total_payments_with_mints}`);
            console.log(`   Total Mints: ${total_mints}`);
            console.log(`   Average Mints per Payment: ${parseFloat(avg_mints_per_payment).toFixed(2)}`);
        }

        console.log('\n✅ Check complete\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();

