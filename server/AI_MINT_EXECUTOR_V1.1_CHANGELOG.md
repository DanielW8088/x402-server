# AI Mint Executor 优化 v1.1

## 优化内容

### 1. 添加支付超时机制 ⏰

**问题**: 用户创建任务后如果不支付，任务会一直在 `pending_payment` 状态。

**解决方案**: 添加 10 分钟超时机制：
- 任务创建后，executor 每 10 秒检查一次
- 如果 10 分钟内没有收到足够的 USDC，自动取消任务
- 状态更新为 `cancelled`，并记录超时原因

**配置**:
```typescript
const PAYMENT_TIMEOUT = 10 * 60 * 1000; // 10 minutes
```

**日志输出**:
```
💰 Checking pending_payment task abc12345...
   ⏰ Task exceeded payment timeout (11 minutes)
   ❌ Cancelling task due to timeout...
   ✅ Task cancelled successfully
```

### 2. 统一日志管理系统 📝

**问题**: 代码中使用原始的 `console.log/error`，难以控制日志级别和格式。

**解决方案**: 使用项目的统一日志系统 (`lib/logger.ts`)：

| 原始调用 | 新调用 | 用途 |
|---------|--------|------|
| `console.log` (startup) | `log.startup()` | 启动信息（总是显示） |
| `console.log` (info) | `log.info()` | 一般信息 |
| `console.log` (debug) | `log.debug()` | 调试信息（仅开发模式） |
| `console.log` (success) | `log.success()` | 成功操作 |
| `console.log` (mint) | `log.mint()` | Mint 操作 |
| `console.error` | `log.error()` | 错误信息 |
| `console.warn` | `log.warn()` | 警告信息 |

**优势**:
- ✅ 统一格式：所有日志带时间戳和级别
- ✅ 可控制：通过 `LOG_LEVEL` 环境变量控制
- ✅ 生产优化：生产环境自动隐藏 debug 日志
- ✅ 更易调试：日志带上下文信息

**日志级别**:
```bash
# Development (shows all)
LOG_LEVEL=DEBUG npm run start:ai-mint

# Production (only INFO and above)
LOG_LEVEL=INFO npm run start:ai-mint

# Errors only
LOG_LEVEL=ERROR npm run start:ai-mint
```

### 3. 改进的任务监控 📊

**新增信息显示**:
```
💰 Checking pending_payment task abc12345...
   Agent wallet balance: 5.00 USDC
   Required: 10.00 USDC
   Task age: 2m 15s / 10m timeout    ← 新增！
   ⏳ Insufficient balance, will check again...
```

**状态转换**:
```
pending_payment (0-10min) → funded → processing → completed
                  ↓ (>10min)
               cancelled (timeout)
```

## 数据库变更

无需新的数据库迁移，使用现有的 `status` 和 `error_message` 字段：

```sql
-- 超时任务示例
SELECT id, status, error_message, completed_at
FROM ai_agent_tasks
WHERE status = 'cancelled';

-- 结果:
-- status: 'cancelled'
-- error_message: 'Payment timeout: No sufficient balance received within 10 minutes'
-- completed_at: 2025-11-01 05:15:30
```

## 配置参数

所有关键参数都在 `ai-mint-executor.ts` 顶部：

```typescript
const MINT_INTERVAL = 5000;           // 5s between mints
const CHECK_INTERVAL = 10000;         // 10s to check tasks
const MAX_BATCH_SIZE = 10;            // Max 10 mints per batch
const MAX_RETRY_COUNT = 3;            // Max 3 retries
const PAYMENT_TIMEOUT = 10 * 60 * 1000; // 10 minutes timeout ← 新增
```

## 启动信息

```
╔════════════════════════════════════════════════════════════╗
║          AI Mint Executor v1.1 Initialized               ║
╚════════════════════════════════════════════════════════════╝

🔧 Configuration:
   Network: base-sepolia
   Server URL: http://localhost:4021
   RPC Endpoints: 2
      1. https://...
      2. https://...
   AI Agent Account: 0x7064...
   USDC: 0x036C...
   Mint Interval: 5s
   Check Interval: 10s
   Payment Timeout: 10 minutes    ← 新增
   Max Retry Count: 3

🚀 Starting AI Mint Executor...
   Monitoring for funded tasks...
```

## 部署

```bash
cd /Users/daniel/code/402/token-mint/server

# 1. 编译
npm run build

# 2. 重启 AI Mint Executor
pm2 restart ai-mint-executor

# 3. 查看日志
pm2 logs ai-mint-executor
```

## 测试场景

### 场景 1: 正常流程
```
1. 用户创建任务 (t=0s)
2. 用户立即支付 USDC (t=5s)
3. Executor 检测到余额充足 (t=10s)
4. 自动标记为 'funded' (t=10s)
5. 开始 mint (t=10s)
6. 完成 (t=20s)
```

### 场景 2: 超时取消
```
1. 用户创建任务 (t=0)
2. 用户忘记支付 (t=0-10min)
3. Executor 每 10s 检查一次
4. 10 分钟后检测到超时 (t=10min)
5. 自动取消任务，状态变为 'cancelled'
```

### 场景 3: 接近超时时支付
```
1. 用户创建任务 (t=0)
2. 用户在第 9 分钟支付 (t=9min)
3. Executor 在第 9 分钟 10 秒检测到余额 (t=9min 10s)
4. 自动标记为 'funded'
5. 正常完成 mint
```

## 用户体验改进

1. ✅ **自动清理**: 不再有"僵尸"任务占用系统资源
2. ✅ **明确反馈**: 用户知道任务因超时被取消
3. ✅ **可重试**: 用户可以创建新任务重试
4. ✅ **实时监控**: 日志清晰显示任务年龄和剩余时间

## 监控和调试

### 查看超时任务
```sql
SELECT 
  id,
  user_address,
  quantity,
  status,
  error_message,
  created_at,
  completed_at,
  EXTRACT(EPOCH FROM (completed_at - created_at))/60 as duration_minutes
FROM ai_agent_tasks
WHERE status = 'cancelled'
  AND error_message LIKE '%timeout%'
ORDER BY created_at DESC;
```

### 实时监控
```bash
# 实时查看日志
pm2 logs ai-mint-executor --lines 100

# 只看超时相关
pm2 logs ai-mint-executor --lines 100 | grep "timeout"

# 查看任务统计
pm2 logs ai-mint-executor --lines 100 | grep "Found.*task"
```

## 版本历史

- **v1.1** (2025-11-01): 添加支付超时和统一日志系统
- **v1.0** (2025-10-30): 初始版本，基础 mint executor


