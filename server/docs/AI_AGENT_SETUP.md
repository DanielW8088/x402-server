# 🤖 AI Agent 自动 Mint 系统设置指南

## 概述

AI Agent 系统允许用户通过 chatbot 对话创建自动 mint 任务。用户充值 USDC 到专属 agent 钱包，agent 会自动签名和执行 mint 操作。

### 核心特性

- 💬 **Chat Interface** - 自然语言对话创建任务
- 🔐 **Secure Wallets** - 每个用户独立的 agent 钱包（私钥加密存储）
- ⚡ **Auto Mint** - 收到 USDC 后自动执行 mint
- 📊 **Task Tracking** - 实时追踪任务进度
- 🎯 **User-owned Tokens** - Minted tokens 发送到用户主钱包

## 架构

```
User Wallet (0xUser...)
    ↓ 充值 USDC
    ↓ 接收 Tokens
    
Agent Wallet (0xAgent...)
    ↓ 托管私钥（加密）
    ↓ 自动签名支付
    ↓ 调用 Mint API
    
Server
    ↓ 处理支付
    ↓ 执行 Mint
    ↓ Tokens → User Wallet
```

## 环境变量设置

### 1. 生成加密密钥

首先需要生成一个加密密钥用于保护 agent 钱包私钥：

```bash
cd server

# 方式 1: 使用 Node.js 生成
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 方式 2: 使用 OpenSSL
openssl rand -hex 32

# 输出示例:
# 1a2b3c4d5e6f7890abcdef1234567890fedcba0987654321abcdef1234567890
```

### 2. 添加到 .env

```bash
# server/.env

# AI Agent 加密密钥（必需！）
# 用于加密/解密 agent 钱包私钥
AGENT_ENCRYPTION_KEY=1a2b3c4d5e6f7890abcdef1234567890fedcba0987654321abcdef1234567890

# 其他必需环境变量
DATABASE_URL=postgresql://...
SERVER_PRIVATE_KEY=0x...
MINTER_PRIVATE_KEY=0x...
```

⚠️ **重要安全提示：**
- 保管好 `AGENT_ENCRYPTION_KEY`，丢失后无法解密已存储的私钥
- 不要泄露此密钥
- 生产环境建议使用密钥管理服务（如 AWS KMS, Vault）

## 数据库迁移

### 1. 运行 Migration

```bash
cd server

# 运行 AI Agent 系统迁移
psql $DATABASE_URL -f db/migrations/006_add_ai_agent_system.sql
```

### 2. 验证

```bash
# 检查表是否创建成功
psql $DATABASE_URL -c "\dt ai_agent*"

# 应该看到:
# ai_agent_wallets
# ai_agent_chats
# ai_agent_tasks
# ai_agent_mint_records
```

## 启动服务

### 1. 启动主服务器

```bash
cd server

# Development
npm run dev

# Production (with PM2)
npm run build
pm2 start ecosystem.config.cjs
```

### 2. 启动 AI Agent Task Executor（可选独立进程）

如果希望 task executor 独立运行：

```bash
# 创建 PM2 配置
cat > ecosystem.ai-agent.cjs << 'EOF'
module.exports = {
  apps: [{
    name: 'ai-agent-executor',
    script: './dist/queue/ai-agent-executor.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    }
  }]
}
EOF

# 启动
pm2 start ecosystem.ai-agent.cjs
```

或者，task executor 可以集成到主服务器中（推荐）。

## 前端配置

前端无需额外配置，只需确保 `NEXT_PUBLIC_SERVER_URL` 指向后端：

```bash
# 0x402.io/.env.local
NEXT_PUBLIC_SERVER_URL=http://localhost:4021
```

## API 端点

### Chat

```bash
# 发送消息
POST /api/ai-agent/chat
{
  "userAddress": "0x...",
  "message": "我想 mint 个币"
}

# 获取聊天历史
GET /api/ai-agent/history/:address?limit=50
```

### Wallet

```bash
# 获取 agent 钱包信息
GET /api/ai-agent/wallet/:address
```

### Tasks

```bash
# 获取用户任务列表
GET /api/ai-agent/tasks/:address?limit=10

# 获取特定任务
GET /api/ai-agent/task/:taskId

# 取消任务
POST /api/ai-agent/task/:taskId/cancel
```

## 使用流程

### 1. 用户开始对话

```
User: 我想 mint 个币
Agent: 好的！请告诉我你想 mint 的 token 合约地址
```

### 2. 提供 token 地址

```
User: 0x1234567890abcdef1234567890abcdef12345678
Agent: 好的！Token 地址: 0x1234...5678
      你想 mint 多少次呢？(1-1000)
```

### 3. 指定数量

```
User: 100
Agent: ✅ 任务创建成功！
      
      📋 任务详情:
      • Token: 0x1234...5678
      • 数量: 100 次
      • 单价: 1.00 USDC
      • 总计: 100.00 USDC
      
      💰 请转账 100.00 USDC 到:
      0xABCDEF... (agent wallet)
      
      收到转账后，我会自动开始 mint！
```

### 4. 用户充值

用户从主钱包转 USDC 到 agent 钱包地址。

### 5. 自动执行

- Executor 每 15 秒检查一次余额
- 发现充值后，标记任务为 `funded`
- 自动开始 mint 流程
- 每个 mint 间隔 2 秒
- Tokens 直接发送到用户主钱包

### 6. 完成

```
任务状态变化:
pending_payment → funded → processing → completed
```

## 监控和调试

### 查看任务状态

```sql
-- 查看所有任务
SELECT 
  user_address,
  token_address,
  quantity,
  status,
  mints_completed,
  mints_failed,
  created_at
FROM ai_agent_tasks
ORDER BY created_at DESC
LIMIT 20;

-- 查看待处理任务
SELECT * FROM ai_agent_tasks WHERE status IN ('pending_payment', 'funded');

-- 查看用户的 agent 钱包
SELECT 
  user_address,
  agent_address,
  usdc_balance,
  last_balance_check
FROM ai_agent_wallets;
```

### 日志

```bash
# 主服务器日志
pm2 logs token-server

# Agent executor 日志（如果独立运行）
pm2 logs ai-agent-executor

# 查看特定错误
pm2 logs token-server --err
```

### 手动触发任务检查

如果需要立即检查任务状态（开发调试用）：

```typescript
// 在 server 中添加测试端点
app.post("/api/ai-agent/debug/check-tasks", async (req, res) => {
  // 手动触发检查
  await executor.checkPendingPayments();
  await executor.executeFundedTasks();
  res.json({ success: true });
});
```

## 安全考虑

### 1. 私钥加密

- 使用 AES-256-GCM 加密
- IV 和 Auth Tag 随机生成
- 密钥来自环境变量

### 2. 权限控制

- Agent 钱包只能用于支付，不能提现（需用户主动操作）
- Tokens 永远发送到用户主钱包，不经过 agent

### 3. 限制

```typescript
// aiAgentService.ts 中的限制
- 单次 mint 数量: 1-1000
- Chat message 最大长度: 1000 字符
```

### 4. 审计

所有操作都有完整日志：
- `ai_agent_chats` - 聊天记录
- `ai_agent_tasks` - 任务记录
- `ai_agent_mint_records` - 每个 mint 的详细记录

## 故障排查

### 问题：加密密钥错误

```
Error: AGENT_ENCRYPTION_KEY environment variable not set
```

**解决：** 在 .env 中添加 `AGENT_ENCRYPTION_KEY`

### 问题：无法解密私钥

```
Error: Failed to decrypt private key: Invalid encrypted data format
```

**可能原因：**
1. `AGENT_ENCRYPTION_KEY` 改变了
2. 数据库中的加密数据损坏

**解决：** 检查环境变量是否正确

### 问题：任务一直 pending_payment

**检查：**
1. 用户是否真的转账了
2. Agent 钱包地址是否正确
3. Executor 是否在运行
4. RPC 连接是否正常

```bash
# 检查 agent 余额
cast balance <agent_address> --rpc-url <rpc_url>

# 检查 USDC 余额
cast call <usdc_address> "balanceOf(address)(uint256)" <agent_address> --rpc-url <rpc_url>
```

### 问题：Mint 失败

**检查：**
1. Agent 钱包是否有足够 USDC
2. Token 合约是否正常
3. 价格是否正确
4. 查看 error_message 字段

```sql
SELECT error_message FROM ai_agent_tasks WHERE status = 'failed';
```

## 性能优化

### 1. 并发执行

在 `ai-agent-executor.ts` 中调整：

```typescript
// 同时处理更多任务
const result = await this.pool.query(
  `... LIMIT 5` // 增加到 10 或更多
);
```

### 2. 检查频率

```typescript
private pollInterval: number = 15000; // 改为 5000 更快响应
```

### 3. 批量 Mint

修改为使用 batch mint API（如果支持）：

```typescript
// 一次性 mint 多个
await fetch(`${this.serverUrl}/api/mint/${task.tokenAddress}`, {
  body: JSON.stringify({
    authorization,
    recipient: task.userAddress,
    quantity: 10, // 批量 mint
  }),
});
```

## 扩展功能

### 待开发功能

1. **智能策略**
   - 价格监控：当价格低于 X 时自动 mint
   - 时间计划：定时 mint
   - 跟随模式：跟随 whale 地址

2. **提现功能**
   - 允许用户提现 agent 钱包余额

3. **手续费优化**
   - Gas price 优化
   - 批量处理降低成本

4. **通知系统**
   - Email/Telegram 通知任务完成
   - 余额不足提醒

## 总结

AI Agent 系统已完全实现并可用：

✅ 数据库 schema  
✅ 加密工具  
✅ Chatbot 对话逻辑  
✅ 自动任务执行  
✅ API endpoints  
✅ 前端 Chat UI  

开始使用：
1. 设置 `AGENT_ENCRYPTION_KEY`
2. 运行 migration
3. 启动服务器
4. 访问前端 AI Agent 页面
5. 连接钱包开始对话！

有问题？查看日志或检查数据库状态。

