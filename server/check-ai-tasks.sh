#!/bin/bash
# 检查 AI Agent 任务状态

echo "📋 AI Agent Tasks Status"
echo "======================="
echo ""

# 从 .env 读取数据库连接
source .env

# 检查任务
echo "🔍 Checking tasks..."
node -e "
const { Pool } = require('pg');
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('sslmode=require') ? { rejectUnauthorized: false } : false
});

(async () => {
  try {
    const result = await pool.query(\`
      SELECT id, status, token_address, quantity, mints_completed, mints_failed, 
             created_at, started_at, completed_at
      FROM ai_agent_tasks 
      ORDER BY created_at DESC 
      LIMIT 10
    \`);
    
    console.log('Total tasks:', result.rows.length);
    console.log('');
    
    result.rows.forEach((row, i) => {
      console.log(\`Task \${i + 1}:\`);
      console.log(\`  ID: \${row.id}\`);
      console.log(\`  Status: \${row.status}\`);
      console.log(\`  Token: \${row.token_address}\`);
      console.log(\`  Progress: \${row.mints_completed}/\${row.quantity}\`);
      console.log(\`  Failed: \${row.mints_failed}\`);
      console.log(\`  Created: \${row.created_at}\`);
      console.log('');
    });
    
    // Count by status
    const countResult = await pool.query(\`
      SELECT status, COUNT(*) as count
      FROM ai_agent_tasks
      GROUP BY status
    \`);
    
    console.log('📊 Status Summary:');
    countResult.rows.forEach(row => {
      console.log(\`  \${row.status}: \${row.count}\`);
    });
    
    await pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();
"

