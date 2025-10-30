#!/usr/bin/env node
/**
 * Mark all pending mints as completed (skip actual minting)
 * 
 * WARNING: This will skip the actual on-chain minting process.
 * Only use this if:
 * 1. Mints are already completed on-chain but DB is out of sync
 * 2. You need to emergency stop all pending mints
 * 3. You're cleaning up test data
 * 
 * This script will:
 * - Mark all pending mints as 'completed'
 * - Move them to mint_history
 * - Set mint_tx_hash to 'manual-completed'
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
        console.log('\n⚠️  WARNING: Mark Pending Mints as Completed\n');
        console.log('This will mark ALL pending mints as completed WITHOUT actual on-chain minting!\n');

        // 1. Preview what will be changed
        const preview = await pool.query(`
      SELECT 
        id,
        payer_address,
        token_address,
        tx_hash_bytes32,
        payment_type,
        created_at,
        EXTRACT(EPOCH FROM (NOW() - created_at)) as age_seconds
      FROM mint_queue
      WHERE status = 'pending'
      ORDER BY created_at ASC
    `);

        if (preview.rows.length === 0) {
            console.log('✅ No pending mints found. Nothing to do.\n');
            process.exit(0);
        }

        console.log(`📋 Found ${preview.rows.length} pending mints:\n`);

        // Show first 10
        preview.rows.slice(0, 10).forEach((row, i) => {
            console.log(`${i + 1}. ID: ${row.id.slice(0, 8)}`);
            console.log(`   Payer: ${row.payer_address.slice(0, 8)}...`);
            console.log(`   Token: ${row.token_address ? row.token_address.slice(0, 8) + '...' : 'N/A'}`);
            console.log(`   Age: ${Math.floor(row.age_seconds)}s`);
            console.log(`   Payment: ${row.payment_type}`);
            console.log('');
        });

        if (preview.rows.length > 10) {
            console.log(`... and ${preview.rows.length - 10} more\n`);
        }

        // Group by token
        const tokenGroups = preview.rows.reduce((acc, row) => {
            const token = row.token_address || 'unknown';
            acc[token] = (acc[token] || 0) + 1;
            return acc;
        }, {});

        console.log('📊 Breakdown by token:');
        Object.entries(tokenGroups).forEach(([token, count]) => {
            console.log(`   ${token.slice(0, 10)}...: ${count} mints`);
        });
        console.log('');

        // Ask for confirmation
        if (process.env.AUTO_CONFIRM !== 'true') {
            console.log('⚠️  These mints will be marked as completed WITHOUT on-chain minting!');
            console.log('   This action cannot be easily undone.');
            console.log('   Press Ctrl+C to cancel, or wait 10 seconds to continue...\n');
            await new Promise(resolve => setTimeout(resolve, 10000));
        }

        console.log('🔄 Starting to mark mints as completed...\n');

        // 2. Begin transaction
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            // 3. Update mint_queue status
            const updateResult = await client.query(`
        UPDATE mint_queue
        SET 
          status = 'completed',
          mint_tx_hash = 'manual-completed',
          processed_at = NOW(),
          updated_at = NOW()
        WHERE status = 'pending'
        RETURNING id, payer_address, tx_hash_bytes32, token_address, payment_type
      `);

            console.log(`✅ Updated ${updateResult.rows.length} mints to 'completed'\n`);

            // 4. Move to mint_history
            let movedCount = 0;
            for (const row of updateResult.rows) {
                try {
                    await client.query(`
            INSERT INTO mint_history 
            (payer_address, payment_tx_hash, tx_hash_bytes32, token_address, mint_tx_hash, amount, payment_type, completed_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
            ON CONFLICT (tx_hash_bytes32) DO NOTHING
          `, [
                        row.payer_address,
                        null, // No payment_tx_hash
                        row.tx_hash_bytes32,
                        row.token_address,
                        'manual-completed',
                        '0', // Unknown amount
                        row.payment_type
                    ]);
                    movedCount++;
                } catch (err) {
                    console.warn(`   ⚠️  Failed to move ${row.id.slice(0, 8)} to history: ${err.message}`);
                }
            }

            console.log(`✅ Moved ${movedCount} items to mint_history\n`);

            // 5. Commit transaction
            await client.query('COMMIT');
            console.log('✅ Transaction committed successfully\n');

            // 6. Show summary
            console.log('📊 Summary:');
            console.log(`   Total processed: ${updateResult.rows.length}`);
            console.log(`   Moved to history: ${movedCount}`);
            console.log(`   Failed to move: ${updateResult.rows.length - movedCount}`);
            console.log('');

            console.log('✅ All pending mints have been marked as completed\n');
            console.log('💡 Note: These mints were NOT processed on-chain.');
            console.log('   They are marked as completed with mint_tx_hash = "manual-completed"\n');

        } catch (err) {
            await client.query('ROLLBACK');
            console.error('\n❌ Transaction failed, rolled back:', err.message);
            throw err;
        } finally {
            client.release();
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();

