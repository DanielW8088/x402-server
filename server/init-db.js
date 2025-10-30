#!/usr/bin/env node
/**
 * Initialize database with proper schema
 */

const { Pool } = require('pg');
const { readFileSync } = require('fs');
const { join } = require('path');
require('dotenv').config();

async function main() {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
        console.error('❌ DATABASE_URL not set');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: databaseUrl,
        ssl: databaseUrl.includes('sslmode=require') ? {
            rejectUnauthorized: false
        } : false,
    });

    try {
        console.log('📊 Initializing database...\n');

        // 1. Test UUID generation (using built-in gen_random_uuid)
        console.log('1️⃣  Testing UUID generation...');
        const testResult = await pool.query('SELECT gen_random_uuid() as id');
        console.log('   ✅ UUID test:', testResult.rows[0].id);
        console.log('   ℹ️  Using gen_random_uuid() (PostgreSQL 13+ built-in)\n');

        // 2. Check if tables exist
        console.log('2️⃣  Checking existing tables...');
        const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

        if (tablesResult.rows.length > 0) {
            console.log('   📋 Existing tables:');
            tablesResult.rows.forEach(row => console.log('      -', row.table_name));
            console.log('');
        } else {
            console.log('   ℹ️  No tables found\n');
        }

        // 3. Run schema if needed
        const checkResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'deployed_tokens'
      ) as exists
    `);

        if (!checkResult.rows[0].exists) {
            console.log('3️⃣  Creating tables from schema...');
            const schemaSQL = readFileSync(join(__dirname, 'db', 'schema-v3.sql'), 'utf8');
            await pool.query(schemaSQL);
            console.log('   ✅ Tables created\n');
        } else {
            console.log('3️⃣  Tables already exist\n');

            // Check deployed_tokens structure
            console.log('4️⃣  Checking deployed_tokens structure...');
            const columnsResult = await pool.query(`
        SELECT column_name, data_type, column_default
        FROM information_schema.columns
        WHERE table_name = 'deployed_tokens'
        AND column_name IN ('id', 'lp_retry_count')
        ORDER BY ordinal_position
      `);

            console.log('   📋 Key columns:');
            columnsResult.rows.forEach(row => {
                console.log(`      - ${row.column_name}: ${row.data_type} (default: ${row.column_default})`);
            });
            console.log('');

            // Add missing columns if needed
            const hasRetryCount = columnsResult.rows.some(r => r.column_name === 'lp_retry_count');
            if (!hasRetryCount) {
                console.log('   🔧 Adding lp_retry_count column...');
                await pool.query(`
          ALTER TABLE deployed_tokens 
          ADD COLUMN IF NOT EXISTS lp_retry_count INTEGER DEFAULT 0
        `);
                console.log('   ✅ Column added\n');
            }
        }

        console.log('✅ Database initialization complete!\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

main();

