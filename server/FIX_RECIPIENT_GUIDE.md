# 🔧 修复 Recipient 问题 - 操作指南

## 问题
Tokens 被 mint 到了 Agent Wallet，而不是 User Wallet。

## 原因
虽然代码已经更新（添加了 `recipient` 参数），但：
1. 服务器代码还没有重新编译
2. 服务还没有重启

## 修复步骤

### 1. 运行数据库迁移（如果还没运行）

```bash
cd /Users/daniel/code/402/token-mint/server

node -e "
const { Pool } = require('pg');
const fs = require('fs');
require('dotenv').config();

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL, 
  ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? { rejectUnauthorized: false } : false 
});

const sql = fs.readFileSync('db/migrations/009_add_recipient_to_mint_queue.sql', 'utf8');
pool.query(sql)
  .then(() => console.log('✅ Migration applied'))
  .catch(e => console.error('❌ Error:', e.message))
  .finally(() => pool.end());
"
```

### 2. 重新编译和重启服务

```bash
cd /Users/daniel/code/402/token-mint/server

# 方法 1: 使用快速脚本
./rebuild-and-restart.sh

# 方法 2: 手动执行
npm run build
pm2 restart token-mint-server
pm2 restart ai-mint-executor
```

### 3. 验证修复

创建一个新的 AI Agent 任务，然后检查日志：

```bash
# 查看 AI Mint Executor 日志
pm2 logs ai-mint-executor --lines 50

# 应该看到：
# ║  Processing Task: xxxxxxxx...
# ╚════════════════════════════════════════════════════════════╝
#    Token: 0x...
#    User Wallet (recipient): 0x7382...  ← 用户地址
#    Agent Wallet (payer): 0x2950...     ← Agent 地址
#    📤 Sending to API:
#       - Payer (from): 0x2950...
#       - Recipient (to): 0x7382...      ← 关键！应该不同

# 查看服务器日志
pm2 logs token-mint-server --lines 30

# 应该看到：
# 🎯 RECIPIENT CHECK: payer=0x2950..., recipient=0x7382..., match=✅ DIFFERENT
```

### 4. 验证数据库

```bash
node -e "
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL, 
  ssl: process.env.DATABASE_URL?.includes('sslmode=require') ? { rejectUnauthorized: false } : false 
});

pool.query(\`
  SELECT 
    id, 
    payer_address as payer,
    recipient,
    status,
    CASE WHEN payer_address != recipient THEN '✅ DIFFERENT' ELSE '❌ SAME' END as check
  FROM mint_queue 
  WHERE created_at > NOW() - INTERVAL '1 hour'
  ORDER BY created_at DESC 
  LIMIT 5
\`)
  .then(r => {
    console.log('Recent mint queue items:');
    console.table(r.rows);
    pool.end();
  })
  .catch(e => {
    console.error('Error:', e.message);
    pool.end();
  });
"
```

### 5. 验证链上 Tokens

检查用户钱包是否收到 tokens：

```bash
# 用户地址
USER_ADDRESS="0x7382a3a97e2623e6b33367c7c96426f85c61fd32"

# Agent 地址
AGENT_ADDRESS="0x29508ecfcf25873a1a40eadf83bc1efa0055ed8e"

# Token 地址（从任务中获取）
TOKEN_ADDRESS="<token_address_from_task>"

# 在 Base Sepolia Explorer 查看：
echo "User balance: https://sepolia.basescan.org/token/${TOKEN_ADDRESS}?a=${USER_ADDRESS}"
echo "Agent balance: https://sepolia.basescan.org/token/${TOKEN_ADDRESS}?a=${AGENT_ADDRESS}"
```

**预期结果**：
- ✅ User Wallet 应该有 tokens
- ✅ Agent Wallet 应该没有（或很少）tokens

## 关键代码更改

### ai-mint-executor.ts
```typescript
// Line 607
recipient: task.userAddress, // Tokens go to USER, not agent
```

### routes/mint.ts
```typescript
// Line 348
const recipient = req.body.recipient || payer;

// Line 377
recipient // Recipient (who receives the tokens)
```

### queue/processor.ts
```typescript
// Line 413
const addressesToProcess = itemsToProcess.map((item) => 
  (item.recipient || item.payer_address) as `0x${string}`
);
```

## 故障排查

### 问题：日志中仍然显示 payer == recipient

**可能原因**：
1. 代码没有重新编译 → 运行 `npm run build`
2. 服务没有重启 → 运行 `pm2 restart`
3. PM2 使用了旧的代码 → 运行 `pm2 delete all && pm2 start ecosystem.config.cjs`

### 问题：TypeScript 编译错误

**解决方案**：
```bash
cd /Users/daniel/code/402/token-mint/server
rm -rf dist/
npm run build
```

### 问题：数据库连接失败

**解决方案**：
检查 `.env` 文件中的 `DATABASE_URL` 是否正确。

## 测试新任务

1. 创建一个新的 AI Agent mint 任务
2. 用户支付 USDC 到 Agent Wallet
3. 等待 AI Executor 自动执行
4. 检查日志确认 recipient 不同
5. 在区块链浏览器确认 tokens 到达用户钱包

## 成功标志

✅ 日志显示 `User Wallet (recipient): 0x7382...`  
✅ 日志显示 `Agent Wallet (payer): 0x2950...`  
✅ 日志显示 `match=✅ DIFFERENT`  
✅ 数据库 `payer_address != recipient`  
✅ 用户钱包有 tokens，Agent 钱包没有

