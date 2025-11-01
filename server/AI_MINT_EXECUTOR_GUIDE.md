# 🤖 AI Mint Executor Service

## 概述

AI Mint Executor 是一个独立的后台服务，负责自动执行用户通过 AI Agent 创建的 mint 任务。

## 工作流程

### 1. 用户与 AI 对话

```
User: 我想 mint 100 个 token
AI: 请告诉我 token 地址
User: 0x1234...
AI: ✅ 任务创建成功！
    Token: 0x1234...
    数量: 100 次
    总成本: 10 USDC
    
    请转账 10 USDC 到你的 AI Agent 钱包:
    地址: 0xABCD...
    任务ID: abc-123-def
```

### 2. 用户确认并支付

用户使用 EIP-3009 签名，授权从自己的钱包转账 USDC 到 AI Agent 钱包。

前端调用:
```typescript
POST /api/ai-agent/task/:taskId/fund
{
  "authorization": {
    "from": "0xUser...",
    "to": "0xAgent...",
    "value": "10000000", // 10 USDC (6 decimals)
    "validAfter": 0,
    "validBefore": 999999999999,
    "nonce": "0x..."
  },
  "signature": "0x..."
}
```

### 3. AI Mint Executor 自动执行

当任务状态变为 `funded` 后，AI Mint Executor 会：

1. 从数据库读取待处理的任务
2. 解密 AI Agent 钱包私钥
3. 批量 mint tokens（每批最多 10 个）
4. 间隔 5 秒执行下一次 mint
5. 更新任务进度

## 架构

```
┌─────────────────┐
│   User Wallet   │
│  (用户钱包)      │
└────────┬────────┘
         │ EIP-3009 Transfer
         │ (用户签名授权)
         ↓
┌─────────────────┐
│  AI Agent       │◄─────┐
│  Wallet         │      │
│  (专属钱包)      │      │ 解密私钥
└────────┬────────┘      │
         │               │
         │ X402 Mint     │
         ↓               │
┌─────────────────┐      │
│  Token Contract │      │
│  (代币合约)      │      │
└─────────────────┘      │
                         │
┌─────────────────────────┴──┐
│  AI Mint Executor Service  │
│  (后台自动执行服务)          │
└────────────────────────────┘
```

## 部署

### 1. 编译

```bash
cd server
npm run build
```

### 2. 启动服务

```bash
# 使用 PM2
pm2 start ecosystem.ai-mint.cjs

# 查看日志
pm2 logs ai-mint-executor

# 查看状态
pm2 status

# 重启
pm2 restart ai-mint-executor

# 停止
pm2 stop ai-mint-executor
```

### 3. 环境变量

需要在 `.env` 文件中配置:

```bash
DATABASE_URL=postgresql://...
NETWORK=base-sepolia  # 或 base
BASE_SEPOLIA_RPC_URL=https://...
BASE_RPC_URL=https://...
```

私钥文件 (`~/.config/token-mint/private.key` 或 `/etc/secret/private.key`):

```json
{
  "serverPrivateKey": "0x...",
  "minterPrivateKey": "0x...",
  "lpDeployerPrivateKey": "0x...",
  "agentEncryptionKey": "1a2b3c..."
}
```

## 配置参数

### 在 `ai-mint-executor.ts` 中修改:

```typescript
const MINT_INTERVAL = 5000;      // 5 秒 - mint 间隔时间
const CHECK_INTERVAL = 10000;    // 10 秒 - 检查新任务的间隔
const MAX_BATCH_SIZE = 10;       // 每批最多 10 个 mint
const MIN_BATCH_SIZE = 1;        // 每批最少 1 个 mint
```

## 数据库表

### ai_agent_wallets

```sql
CREATE TABLE ai_agent_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address VARCHAR(42) NOT NULL,
  agent_address VARCHAR(42) NOT NULL,
  encrypted_private_key TEXT NOT NULL,
  usdc_balance VARCHAR(78) DEFAULT '0',
  last_balance_check TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### ai_agent_tasks

```sql
CREATE TABLE ai_agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_address VARCHAR(42) NOT NULL,
  agent_wallet_id UUID NOT NULL REFERENCES ai_agent_wallets(id),
  token_address VARCHAR(42) NOT NULL,
  quantity INTEGER NOT NULL,
  price_per_mint VARCHAR(78) NOT NULL,
  total_cost VARCHAR(78) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending_payment' NOT NULL,
  mints_completed INTEGER DEFAULT 0,
  mints_failed INTEGER DEFAULT 0,
  funding_tx_hash VARCHAR(66),
  error_message TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP
);
```

## 任务状态

| 状态 | 说明 |
|------|------|
| `pending_payment` | 等待用户支付 |
| `funded` | 已支付，等待执行 |
| `processing` | 正在执行 mint |
| `completed` | 全部完成 |
| `failed` | 执行失败 |
| `cancelled` | 用户取消 |

## API 接口

### 1. 创建任务（通过 AI 对话）

```bash
POST /api/ai-agent/chat
{
  "userAddress": "0x...",
  "message": "我想 mint 100 个 0x1234..."
}
```

### 2. 支付任务

```bash
POST /api/ai-agent/task/:taskId/fund
{
  "authorization": { ... },
  "signature": "0x..."
}
```

### 3. 查看任务

```bash
GET /api/ai-agent/tasks/:userAddress
```

### 4. 查看单个任务

```bash
GET /api/ai-agent/task/:taskId
```

### 5. 取消任务

```bash
POST /api/ai-agent/task/:taskId/cancel
```

### 6. 重试失败任务

```bash
POST /api/ai-agent/task/:taskId/retry
```

## 监控

### 查看日志

```bash
# 实时日志
pm2 logs ai-mint-executor

# 错误日志
tail -f logs/ai-mint-error.log

# 输出日志
tail -f logs/ai-mint-out.log
```

### 查看任务进度

```sql
-- 待处理任务
SELECT id, token_address, quantity, mints_completed, status
FROM ai_agent_tasks
WHERE status IN ('funded', 'processing')
ORDER BY created_at;

-- 任务统计
SELECT status, COUNT(*)
FROM ai_agent_tasks
GROUP BY status;
```

## 安全考虑

### 1. 私钥加密

每个 AI Agent 钱包的私钥都使用 AES-256-GCM 加密存储：

```typescript
// 加密
const encrypted = encryptPrivateKey(privateKey);

// 解密
const privateKey = decryptPrivateKey(encrypted);
```

加密密钥从 `private.key` 文件的 `agentEncryptionKey` 读取。

### 2. 权限控制

- AI Agent 钱包只能 mint，不能做其他操作
- 用户资金在自己钱包，只授权特定金额
- 每个用户有独立的 AI Agent 钱包

### 3. 速率限制

- Mint 间隔：5 秒
- 每批最多：10 个
- 避免 spam 和 rate limiting

## 故障处理

### 1. 任务卡住不执行

```bash
# 检查服务状态
pm2 status ai-mint-executor

# 查看日志
pm2 logs ai-mint-executor

# 重启服务
pm2 restart ai-mint-executor
```

### 2. Mint 失败

```sql
-- 查看失败任务
SELECT id, token_address, error_message
FROM ai_agent_tasks
WHERE status = 'failed'
ORDER BY created_at DESC;

-- 重试失败任务
UPDATE ai_agent_tasks
SET status = 'funded', error_message = NULL
WHERE id = 'task-id-here';
```

### 3. 余额不足

```sql
-- 检查 AI Agent 钱包余额
SELECT agent_address, usdc_balance
FROM ai_agent_wallets
WHERE usdc_balance < '1000000'; -- 少于 1 USDC
```

用户需要重新支付或补充余额。

## 性能优化

### 1. 批量执行

每次最多 mint 10 个，减少 gas 费用和执行时间。

### 2. 并发控制

只运行 1 个实例，避免竞争条件和重复执行。

### 3. 数据库索引

```sql
CREATE INDEX idx_ai_agent_tasks_status 
ON ai_agent_tasks(status) 
WHERE status IN ('funded', 'processing');
```

## 成本估算

### Gas 费用

- 每次 mint: ~0.0001 ETH (~$0.0002)
- 100 次 mint: ~0.01 ETH (~$0.02)

### USDC 费用

- 取决于 token 价格（通常 1 USDC per 10 mints）
- 100 次 mint: ~10 USDC

### 总计

100 次 mint ≈ $10.02

## 扩展功能

### 未来可以添加:

1. **优先级队列**: VIP 用户优先执行
2. **批量优化**: 动态调整批量大小
3. **Gas 优化**: 智能 gas 价格调整
4. **通知系统**: 完成后推送通知
5. **统计分析**: 任务成功率、平均时间等

## 总结

AI Mint Executor 提供了一个完整的自动化 mint 解决方案：

✅ **用户友好**: 通过 AI 对话即可创建任务  
✅ **安全可靠**: EIP-3009 + 加密私钥  
✅ **自动执行**: 后台服务自动处理  
✅ **可监控**: 完整的日志和状态追踪  
✅ **可扩展**: 易于添加新功能

---

**部署日期**: 2025-11-01  
**版本**: v1.0  
**状态**: ✅ Ready for production

