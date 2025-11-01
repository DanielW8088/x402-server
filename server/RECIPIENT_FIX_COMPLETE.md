# 🔧 Recipient 修复 - 完整版

## 根本问题

Tokens 被 mint 到了 Agent Wallet 而不是 User Wallet。

### 问题原因

**Payment Callback** 在处理 traditional EIP-3009 payment 后创建 mint queue 时，metadata 中没有 `recipient` 信息，导致只使用 `payer` 作为 mint 目标。

## 修复清单

### ✅ 1. 数据库迁移
添加 `recipient` 字段到 `mint_queue` 表。
**文件**: `db/migrations/009_add_recipient_to_mint_queue.sql`

### ✅ 2. Queue Processor
更新 `addToQueue` 接受 `recipient` 参数。
**文件**: `queue/processor.ts`

### ✅ 3. Mint 处理逻辑
使用 `recipient` 而不是 `payer_address` 来 mint tokens。
**文件**: `queue/processor.ts` Line 413

### ✅ 4. Mint API - 直接调用
传递 `recipient` 到 `addToQueue`。
**文件**: `routes/mint.ts` Line 370-378

### ✅ 5. **关键修复** - Payment Metadata
在 metadata 中添加 `recipient`。
**文件**: `routes/mint.ts` Line 221
```typescript
{ quantity, recipient } // ADD recipient to metadata!
```

### ✅ 6. **关键修复** - Payment Callback
从 metadata 读取并使用 `recipient`。
**文件**: `index-multi-token.ts` Line 131-153
```typescript
const { quantity, recipient: metadataRecipient } = item.metadata;
const recipient = metadataRecipient || payer;

// Use recipient for txHash generation and addToQueue
const txHashBytes32 = generateMintTxHash(recipient, timestamp + i, tokenAddress);
const queueId = await queueProcessor.addToQueue(
  payer,
  txHashBytes32,
  txHash,
  item.authorization,
  'traditional',
  tokenAddress,
  recipient // Pass recipient!
);
```

## 重新部署步骤

### 1. 编译 TypeScript
```bash
cd /Users/daniel/code/402/token-mint/server
npm run build
```

### 2. 重启服务
```bash
pm2 restart token-mint-server
pm2 restart ai-mint-executor
```

或使用快捷脚本：
```bash
./rebuild-and-restart.sh
```

### 3. 验证修复

创建新的 AI Agent 任务后，检查日志：

```bash
# 服务器日志
pm2 logs token-mint-server --lines 50
```

**应该看到**：
```
🎯 RECIPIENT CHECK: payer=0x2950..., recipient=0x7382..., match=✅ DIFFERENT
🎯 Payment callback mint: payer=0x2950..., recipient=0x7382...
```

### 4. 验证数据库

```bash
node -e '
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL, 
  ssl: process.env.DATABASE_URL?.includes("sslmode=require") ? { rejectUnauthorized: false } : false 
});

pool.query(`
  SELECT 
    id,
    payer_address as payer,
    recipient,
    status,
    CASE WHEN payer_address != recipient THEN "✅ DIFFERENT" ELSE "❌ SAME" END as check
  FROM mint_queue 
  WHERE created_at > NOW() - INTERVAL "1 hour"
  ORDER BY created_at DESC 
  LIMIT 5
`)
  .then(r => {
    console.log("Recent mint queue items:");
    console.table(r.rows);
    pool.end();
  })
  .catch(e => {
    console.error("Error:", e.message);
    pool.end();
  });
'
```

**预期结果**：
```
┌─────────┬──────────┬──────────┬───────────┬──────────────┐
│ (index) │ payer    │ recipient│ status    │ check        │
├─────────┼──────────┼──────────┼───────────┼──────────────┤
│ 1       │ 0x2950...│ 0x7382...│ completed │ ✅ DIFFERENT │
└─────────┴──────────┴──────────┴───────────┴──────────────┘
```

## 数据流

### 修复前（错误）
```
AI Executor → API → routes/mint.ts
   ↓
   传递 recipient: task.userAddress ✅
   ↓
Payment Queue Processor
   ↓
Callback (index-multi-token.ts)
   metadata = { quantity }  ❌ 没有 recipient！
   ↓
addToQueue(payer, ..., undefined)
   ↓
mint_queue.recipient = payer  ❌ 错误！
```

### 修复后（正确）
```
AI Executor → API → routes/mint.ts
   ↓
   recipient = req.body.recipient || payer
   metadata = { quantity, recipient } ✅
   ↓
Payment Queue Processor
   ↓
Callback (index-multi-token.ts)
   recipient = metadata.recipient || payer ✅
   ↓
addToQueue(payer, ..., recipient) ✅
   ↓
mint_queue.recipient = recipient ✅ 正确！
   ↓
Mint Processor
   mint(recipient, txHash) ✅ Tokens 去用户钱包！
```

## 关键代码更改

### routes/mint.ts (Line 221)
```typescript
// Before
{ quantity }

// After
{ quantity, recipient }
```

### index-multi-token.ts (Line 131-153)
```typescript
// Before
const { quantity } = item.metadata;
const payer = item.payer;
const txHashBytes32 = generateMintTxHash(payer, ...);
await queueProcessor.addToQueue(payer, ..., tokenAddress);

// After
const { quantity, recipient: metadataRecipient } = item.metadata;
const recipient = metadataRecipient || payer;
const txHashBytes32 = generateMintTxHash(recipient, ...);
await queueProcessor.addToQueue(payer, ..., tokenAddress, recipient);
```

## 测试场景

### 场景 1: AI Agent Mint（需要不同的 recipient）
```typescript
// AI Executor 调用
POST /api/mint/0xToken...
{
  authorization: { from: "0xAgent...", ... },
  recipient: "0xUser...",  // 不同！
  quantity: 5
}

// 预期
payer: 0xAgent...
recipient: 0xUser...  ✅ 不同
tokens → 0xUser... ✅
```

### 场景 2: 普通用户 Mint（相同的 payer/recipient）
```typescript
// 前端调用
POST /api/mint/0xToken...
{
  authorization: { from: "0xUser...", ... },
  quantity: 3
  // 不传 recipient
}

// 预期
payer: 0xUser...
recipient: 0xUser...  ✅ 相同（默认）
tokens → 0xUser... ✅
```

## 成功标志

✅ 编译成功  
✅ 服务重启成功  
✅ 日志显示 `match=✅ DIFFERENT`  
✅ 数据库 `payer_address != recipient`  
✅ User Wallet 收到 tokens  
✅ Agent Wallet 没有 tokens

## 故障排查

### 问题：仍然 recipient == payer
1. 确认代码已经编译：`npm run build`
2. 确认服务已重启：`pm2 restart all`
3. 检查服务器是否加载了新代码：`pm2 logs token-mint-server | grep "RECIPIENT CHECK"`

### 问题：metadata 中没有 recipient
检查 API 调用日志，确认 request body 包含 `recipient`。

### 问题：TypeScript 编译失败
```bash
rm -rf dist/
npm run build
```

