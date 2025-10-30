#!/usr/bin/env node
/**
 * Query pending/processing mints from database
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
        console.log('\n🔍 Querying pending/processing mints...\n');

        // 1. Check for duplicates by tx_hash_bytes32
        const duplicates = await pool.query(`
      SELECT 
        tx_hash_bytes32,
        COUNT(*) as count,
        array_agg(id) as queue_ids,
        array_agg(status) as statuses,
        array_agg(created_at) as created_times
      FROM mint_queue
      GROUP BY tx_hash_bytes32
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC
      LIMIT 20
    `);

        if (duplicates.rows.length > 0) {
            console.log('🚨 Found duplicate tx_hash_bytes32 entries:');
            duplicates.rows.forEach(row => {
                console.log(`\n   TX Hash: ${row.tx_hash_bytes32}`);
                console.log(`   Count: ${row.count}`);
                console.log(`   Queue IDs: ${row.queue_ids.map(id => id.slice(0, 8)).join(', ')}`);
                console.log(`   Statuses: ${row.statuses.join(', ')}`);
                console.log(`   Created: ${row.created_times.map(t => t.toISOString()).join('\n            ')}`);
            });
        } else {
            console.log('✅ No duplicate tx_hash_bytes32 found');
        }

        // 2. Pending/processing mints
        const pending = await pool.query(`
      SELECT 
        id,
        payer_address,
        tx_hash_bytes32,
        token_address,
        status,
        payment_type,
        queue_position,
        retry_count,
        created_at,
        updated_at,
        error_message
      FROM mint_queue
      WHERE status IN ('pending', 'processing')
      ORDER BY created_at ASC
      LIMIT 50
    `);

        console.log(`\n📋 Pending/Processing Mints: ${pending.rows.length}`);
        if (pending.rows.length > 0) {
            console.log('\nFirst 10 items:');
            pending.rows.slice(0, 10).forEach((row, i) => {
                console.log(`\n${i + 1}. ID: ${row.id.slice(0, 8)}`);
                console.log(`   Payer: ${row.payer_address}`);
                console.log(`   Status: ${row.status}`);
                console.log(`   TX Hash: ${row.tx_hash_bytes32.slice(0, 10)}...`);
                console.log(`   Queue Pos: ${row.queue_position || 'N/A'}`);
                console.log(`   Retries: ${row.retry_count}`);
                console.log(`   Created: ${row.created_at.toISOString()}`);
                if (row.error_message) {
                    console.log(`   Error: ${row.error_message.slice(0, 50)}...`);
                }
            });
        }

        // 3. Check mint_history for duplicates
        const historyDuplicates = await pool.query(`
      SELECT 
        tx_hash_bytes32,
        COUNT(*) as count,
        array_agg(id) as history_ids,
        array_agg(payer_address) as payers,
        array_agg(mint_tx_hash) as mint_txs
      FROM mint_history
      GROUP BY tx_hash_bytes32
      HAVING COUNT(*) > 1
      LIMIT 20
    `);

        if (historyDuplicates.rows.length > 0) {
            console.log('\n\n🚨 Found duplicate tx_hash_bytes32 in mint_history:');
            historyDuplicates.rows.forEach(row => {
                console.log(`\n   TX Hash: ${row.tx_hash_bytes32}`);
                console.log(`   Count: ${row.count}`);
                console.log(`   History IDs: ${row.history_ids.map(id => id.slice(0, 8)).join(', ')}`);
                console.log(`   Payers: ${row.payers.map(p => p.slice(0, 8)).join(', ')}`);
                console.log(`   Mint TXs: ${row.mint_txs.map(tx => tx ? tx.slice(0, 10) : 'null').join(', ')}`);
            });
        } else {
            console.log('\n✅ No duplicate tx_hash_bytes32 in mint_history');
        }

        // 4. Check for items stuck in processing
        const stuck = await pool.query(`
      SELECT 
        id,
        payer_address,
        tx_hash_bytes32,
        status,
        created_at,
        updated_at,
        EXTRACT(EPOCH FROM (NOW() - updated_at)) as stuck_seconds
      FROM mint_queue
      WHERE status = 'processing'
      AND updated_at < NOW() - INTERVAL '5 minutes'
      ORDER BY updated_at ASC
      LIMIT 10
    `);

        if (stuck.rows.length > 0) {
            console.log('\n\n⏰ Found stuck "processing" items (>5 min):');
            stuck.rows.forEach(row => {
                console.log(`   ID: ${row.id.slice(0, 8)} | Stuck for: ${Math.floor(row.stuck_seconds)}s`);
            });
        }

        // 5. Stats summary
        const stats = await pool.query(`
      SELECT 
        status,
        COUNT(*) as count
      FROM mint_queue
      GROUP BY status
      ORDER BY status
    `);

        console.log('\n\n📊 Mint Queue Status Summary:');
        stats.rows.forEach(row => {
            console.log(`   ${row.status}: ${row.count}`);
        });

        console.log('\n✅ Query complete\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();

