#!/usr/bin/env node
/**
 * Reset stuck 'processing' payment items back to 'pending'
 * Use this to fix nonce issues after server restart
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
        console.log('\n🔄 Resetting stuck payment processing items...\n');

        // First, show what will be reset
        const preview = await pool.query(`
      SELECT 
        id,
        payer,
        payment_type,
        token_address,
        status,
        created_at,
        EXTRACT(EPOCH FROM (NOW() - created_at)) as stuck_seconds
      FROM payment_queue
      WHERE status = 'processing'
      ORDER BY created_at ASC
    `);

        if (preview.rows.length === 0) {
            console.log('✅ No stuck payment items found');
            process.exit(0);
        }

        console.log(`Found ${preview.rows.length} stuck 'processing' payment items:\n`);
        preview.rows.forEach((row, i) => {
            if (i < 10) {
                console.log(`  ${i + 1}. ID: ${row.id.slice(0, 8)}`);
                console.log(`     Type: ${row.payment_type}`);
                console.log(`     Payer: ${row.payer.slice(0, 8)}...`);
                console.log(`     Stuck for: ${Math.floor(row.stuck_seconds)}s`);
                console.log(`     Created: ${row.created_at.toISOString()}`);
                console.log('');
            }
        });

        if (preview.rows.length > 10) {
            console.log(`  ... and ${preview.rows.length - 10} more\n`);
        }

        // Ask for confirmation (skip in non-interactive mode)
        if (process.env.AUTO_CONFIRM !== 'true') {
            console.log('⚠️  These items will be reset to "pending" status');
            console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        // Reset items
        const result = await pool.query(`
      UPDATE payment_queue
      SET status = 'pending'
      WHERE status = 'processing'
      RETURNING id, payer, payment_type
    `);

        console.log(`✅ Reset ${result.rows.length} items to 'pending' status`);

        if (result.rows.length > 0) {
            console.log('\nReset items:');
            result.rows.forEach((row, i) => {
                console.log(`  ${i + 1}. ${row.id.slice(0, 8)} (${row.payment_type}, ${row.payer.slice(0, 8)}...)`);
            });
        }

        console.log('\n💡 These items will be processed in the next batch cycle');
        console.log('✅ Reset complete\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();

