#!/usr/bin/env node
/**
 * Reset stuck 'processing' items back to 'pending'
 * Use this if items get stuck before implementing the auto-reset on startup
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
        console.log('\n🔄 Resetting stuck processing items...\n');

        // First, show what will be reset
        const preview = await pool.query(`
      SELECT 
        id,
        payer_address,
        token_address,
        status,
        created_at,
        updated_at,
        EXTRACT(EPOCH FROM (NOW() - updated_at)) as stuck_seconds
      FROM mint_queue
      WHERE status = 'processing'
      ORDER BY updated_at ASC
    `);

        if (preview.rows.length === 0) {
            console.log('✅ No stuck items found');
            process.exit(0);
        }

        console.log(`Found ${preview.rows.length} stuck 'processing' items:\n`);
        preview.rows.forEach((row, i) => {
            if (i < 10) {
                console.log(`  ${i + 1}. ID: ${row.id.slice(0, 8)}`);
                console.log(`     Payer: ${row.payer_address.slice(0, 8)}...`);
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
      UPDATE mint_queue
      SET status = 'pending', updated_at = NOW()
      WHERE status = 'processing'
      RETURNING id, payer_address
    `);

        console.log(`✅ Reset ${result.rows.length} items to 'pending' status`);

        if (result.rows.length > 0) {
            console.log('\nSample reset items:');
            result.rows.slice(0, 5).forEach((row, i) => {
                console.log(`  ${i + 1}. ${row.id.slice(0, 8)} (${row.payer_address.slice(0, 8)}...)`);
            });
            if (result.rows.length > 5) {
                console.log(`  ... and ${result.rows.length - 5} more`);
            }
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

