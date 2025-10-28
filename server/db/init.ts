import { Pool } from "pg";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Initialize database with schema
 */
export async function initDatabase(pool: Pool) {
  try {
    console.log("📊 Initializing database schema...");
    
    // Check if database is already initialized
    const checkResult = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'mint_queue'
      ) as exists
    `);
    
    if (checkResult.rows[0].exists) {
      console.log("✅ Database schema already initialized");
      return;
    }
    
    const schemaSQL = readFileSync(join(__dirname, "schema-v3.sql"), "utf8");
    await pool.query(schemaSQL);
    
    console.log("✅ Database schema initialized successfully");
  } catch (error: any) {
    console.error("❌ Failed to initialize database:", error.message);
    throw error;
  }
}

/**
 * Check database connection
 */
export async function checkDatabaseConnection(pool: Pool): Promise<boolean> {
  try {
    const result = await pool.query("SELECT NOW()");
    console.log("✅ Database connected at:", result.rows[0].now);
    return true;
  } catch (error: any) {
    console.error("❌ Database connection failed:", error.message);
    return false;
  }
}

