# Recipient Fix Summary

## 问题
Tokens 被 mint 到了 `payer_address`（支付者），而不是 `recipient`（接收者）。

在 AI Agent 场景中：
- **Payer**: Agent Wallet（支付 USDC 的钱包）
- **Recipient**: User Wallet（应该收到 tokens 的用户钱包）

## 修复

### 1. 数据库迁移
**文件**: `db/migrations/009_add_recipient_to_mint_queue.sql`

添加 `recipient` 字段到 `mint_queue` 表：
```sql
ALTER TABLE mint_queue
ADD COLUMN recipient TEXT;

-- 为已有记录设置默认值（向后兼容）
UPDATE mint_queue
SET recipient = payer_address
WHERE recipient IS NULL;

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_mint_queue_recipient ON mint_queue(recipient);
```

### 2. 更新 QueueProcessor.addToQueue
**文件**: `queue/processor.ts`

添加 `recipient` 参数：
```typescript
async addToQueue(
  payerAddress: string,
  txHashBytes32: string,
  paymentTxHash?: string,
  authorizationData?: any,
  paymentType: string = "x402",
  tokenAddress?: string,
  recipient?: string // NEW: 接收 tokens 的地址
): Promise<string>
```

### 3. 更新 Mint 处理逻辑
**文件**: `queue/processor.ts`

使用 `recipient` 而不是 `payer_address` 来 mint tokens：
```typescript
// Before:
const addressesToProcess = itemsToProcess.map((item) => item.payer_address as `0x${string}`);

// After:
const addressesToProcess = itemsToProcess.map((item) => (item.recipient || item.payer_address) as `0x${string}`);
```

### 4. 更新 Mint API
**文件**: `routes/mint.ts`

传递 `recipient` 到 `addToQueue`：
```typescript
const queueId = await queueProcessor.addToQueue(
  payer,        // 支付者
  txHashBytes32,
  paymentTxHash,
  useX402 ? { paymentHeader } : authorization,
  paymentMode,
  tokenAddress,
  recipient     // 接收者（NEW）
);
```

## 向后兼容
- 如果 `recipient` 未提供，默认使用 `payer_address`
- 已有的 mint queue 记录会被自动设置为 `recipient = payer_address`
- 不影响现有的 mint 流程（如 `index-multi-token.ts`）

## 测试流程

### 1. 运行数据库迁移
```bash
cd server
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

### 2. 重启服务
```bash
pm2 restart token-mint-server
pm2 restart ai-mint-executor
```

### 3. 测试 AI Agent Mint
1. 用户通过 AI Agent 创建 mint 任务
2. 用户支付 USDC 到 Agent Wallet
3. AI Mint Executor 自动执行 mint
4. **验证**: Tokens 应该被 mint 到**用户的钱包**，而不是 Agent Wallet

### 4. 验证数据库
```sql
-- 检查 mint_queue 表
SELECT id, payer_address, recipient, token_address, status 
FROM mint_queue 
ORDER BY created_at DESC 
LIMIT 5;

-- 验证 payer != recipient
SELECT 
  id, 
  payer_address as agent_wallet,
  recipient as user_wallet,
  CASE WHEN payer_address != recipient THEN '✅ Correct' ELSE '❌ Wrong' END as status
FROM mint_queue 
WHERE recipient IS NOT NULL
ORDER BY created_at DESC 
LIMIT 5;
```

## AI Agent 流程图（修复后）

```
┌─────────────────┐
│   User Wallet   │ (0xUser123)
│  (用户钱包)      │
└────────┬────────┘
         │ 1. Create Task
         │ 2. Pay USDC via EIP-3009
         ↓
┌─────────────────┐
│  AI Agent       │ (0xAgent456)
│  Wallet         │
│  (Agent钱包)     │
└────────┬────────┘
         │ 3. AI Executor detects funded task
         │ 4. Call Mint API with:
         │    - payer: 0xAgent456
         │    - recipient: 0xUser123
         ↓
┌─────────────────┐
│  Mint Queue     │
│  payer: Agent   │
│  recipient: User│ ← NEW!
└────────┬────────┘
         │ 5. Process queue
         ↓
┌─────────────────┐
│  Token Contract │
│  mint(0xUser123)│ ← Tokens go to USER! ✅
└─────────────────┘
```

## 关键改进
✅ Tokens 正确地 mint 到用户钱包  
✅ Agent Wallet 只负责支付 USDC  
✅ 向后兼容（旧的 mint 仍然工作）  
✅ 数据库记录了 payer 和 recipient 的区别  

