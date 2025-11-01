# 🤖 AI Agent 自动 Mint 系统

## 快速概述

AI Agent 系统通过 **chatbot 对话** 让用户创建自动 mint 任务。用户充值 USDC 到专属 agent 钱包，agent 自动签名并执行 mint，minted tokens 发送到用户主钱包。

## 核心流程

```
1. 用户: "我想 mint 个币"
   ↓
2. Agent: "请告诉我 token 地址"
   ↓
3. 用户: "0xAAAA..."
   ↓
4. Agent: "你想 mint 多少次？"
   ↓
5. 用户: "100次"
   ↓
6. Agent: 创建任务 + 显示 agent 钱包地址
   ↓
7. 用户: 转 USDC 到 agent 钱包
   ↓
8. Agent: 自动检测转账 → 自动 mint → tokens 发到用户钱包
```

## 已实现文件

### 后端 (server/)

| 文件 | 说明 |
|------|------|
| `db/migrations/006_add_ai_agent_system.sql` | 数据库 schema |
| `lib/encryption.ts` | 私钥加密/解密工具 |
| `services/aiAgentService.ts` | Chatbot 对话逻辑 + 任务管理 |
| `queue/ai-agent-executor.ts` | 自动任务执行器 |
| `index-multi-token.ts` | API endpoints（已添加） |
| `AI_AGENT_SETUP.md` | 完整设置文档 |
| `scripts/generate-agent-key.js` | 生成加密密钥脚本 |
| `env.multi-token.example` | 环境变量模板（已更新） |

### 前端 (0x402.io/)

| 文件 | 说明 |
|------|------|
| `components/AiAgentView.tsx` | Chat UI 界面 |

## 快速开始

### 1. 生成加密密钥

```bash
cd server
node scripts/generate-agent-key.js

# 输出:
# AGENT_ENCRYPTION_KEY=1a2b3c4d...
```

### 2. 添加到 .env

```bash
# server/.env
AGENT_ENCRYPTION_KEY=1a2b3c4d5e6f7890abcdef1234567890fedcba0987654321abcdef1234567890
```

### 3. 运行数据库迁移

```bash
psql $DATABASE_URL -f db/migrations/006_add_ai_agent_system.sql
```

### 4. 启动服务

```bash
# Development
npm run dev

# Production
npm run build
pm2 restart token-server  # 或 pm2 start ecosystem.config.cjs
```

### 5. 测试

1. 访问前端: http://localhost:3000
2. 切换到 "AI Agent" 页面
3. 连接钱包
4. 开始对话: "我想 mint 个币"

## API 端点

```bash
# Chat
POST /api/ai-agent/chat
{
  "userAddress": "0x...",
  "message": "我想 mint 个币"
}

# 获取 agent 钱包
GET /api/ai-agent/wallet/:address

# 获取任务列表
GET /api/ai-agent/tasks/:address

# 获取聊天历史
GET /api/ai-agent/history/:address

# 获取特定任务
GET /api/ai-agent/task/:taskId

# 取消任务
POST /api/ai-agent/task/:taskId/cancel
```

## 数据库表

```sql
ai_agent_wallets       -- Agent 钱包（加密私钥）
ai_agent_chats         -- 聊天历史
ai_agent_tasks         -- Mint 任务
ai_agent_mint_records  -- 单个 mint 记录
```

## 对话流程示例

```
User: 我想 mint 个币
Agent: 好的！请告诉我你想 mint 的 token 合约地址 (例如: 0x...)

User: 0x1234567890abcdef1234567890abcdef12345678
Agent: 好的！Token 地址: 0x1234...5678
       你想 mint 多少次呢？(1-1000)

User: 100
Agent: ✅ 任务创建成功！
       
       📋 任务详情:
       • Token: 0x1234...5678
       • 数量: 100 次
       • 单价: 1.00 USDC
       • 总计: 100.00 USDC
       
       💰 请转账 100.00 USDC 到:
       0xABCDEF1234567890ABCDEF1234567890ABCDEF12
       
       收到转账后，我会自动开始 mint！
       
       任务ID: abc12345...
```

## 安全特性

✅ **私钥加密存储** - AES-256-GCM  
✅ **环境变量密钥** - 不硬编码  
✅ **Tokens 发到用户钱包** - Agent 不持有 tokens  
✅ **完整审计日志** - 所有操作可追踪  
✅ **权限隔离** - Agent 只能支付，不能随意提现  

## 任务状态

```
pending_payment  →  等待用户转账
funded          →  USDC 已到账
processing      →  正在 mint
completed       →  全部完成
failed          →  失败
cancelled       →  已取消
```

## 监控

```sql
-- 查看所有任务
SELECT * FROM ai_agent_tasks ORDER BY created_at DESC LIMIT 10;

-- 查看待处理任务
SELECT * FROM ai_agent_tasks WHERE status IN ('pending_payment', 'funded');

-- 查看 agent 钱包
SELECT user_address, agent_address, usdc_balance 
FROM ai_agent_wallets;
```

## Task Executor

后台自动运行，每 15 秒：
1. 检查 `pending_payment` 任务的 agent 钱包余额
2. 如果余额充足，标记为 `funded`
3. 执行 `funded` 任务的 mint 操作
4. 更新任务进度

## 扩展功能（可选）

### 已规划但未实现

1. **智能策略**
   - 价格监控触发
   - 定时 mint
   - 跟随 whale 模式

2. **提现功能**
   - 用户提现剩余 USDC

3. **通知系统**
   - Email/Telegram 通知

4. **批量优化**
   - 一次调用 mint 多个

## 故障排查

### 任务一直 pending_payment

- 检查用户是否转账
- 检查 agent 地址是否正确
- 检查 RPC 连接
- 查看 executor 日志

### 加密错误

- 检查 `AGENT_ENCRYPTION_KEY` 是否设置
- 不要修改已有的 encryption key

### Mint 失败

- 检查 USDC 余额
- 检查 token 合约状态
- 查看 `error_message` 字段

## 完整文档

详细设置和使用指南: [server/AI_AGENT_SETUP.md](server/AI_AGENT_SETUP.md)

## 总结

✅ 所有代码已实现  
✅ 数据库 schema 完成  
✅ 前后端 ready  
✅ 安全加密机制  
✅ 自动执行任务  

现在可以部署使用！ 🚀

