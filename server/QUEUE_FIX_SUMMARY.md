# Queue 重复 Mint 问题修复总结

## 🐛 问题诊断

### 发现的问题

1. **服务重启时 items 卡在 'processing' 状态**
   - Items 被标记为 'processing' 后服务崩溃/重启
   - 重启后这些 items 永远不会被重新处理
   - 用户以为失败，重新提交请求，生成新的 tx_hash
   - 结果：可能导致重复 mint（虽然链上有 hasMinted 检查）

2. **批处理失败时误标记其他批次**
   - 失败时标记所有 'processing' 的 items 为 failed
   - 影响了其他正在并发处理的 batch

3. **并发竞态条件**
   - 多个请求同时添加相同的 mint
   - 虽然有 UNIQUE 约束保护，但会导致错误

---

## ✅ 已实施的修复

### 1. 服务启动时自动重置 (processor.ts)

```typescript
// 在 start() 方法中添加
await this.resetStuckItems();
```

**作用：**
- 服务启动时自动将所有 'processing' items 重置为 'pending'
- 确保因崩溃/重启卡住的 items 能被重新处理

### 2. 批处理失败时精确标记 (processor.ts)

```typescript
// 修改前：标记所有 'processing'
WHERE status = 'processing'

// 修改后：只标记当前 batch
WHERE id = ANY($2)  // items.map(item => item.id)
```

**作用：**
- 只标记当前失败 batch 的 items
- 不影响其他并发 batch

### 3. INSERT 时处理冲突 (processor.ts)

```typescript
INSERT INTO mint_queue (...) 
ON CONFLICT (tx_hash_bytes32) DO UPDATE 
  SET updated_at = NOW()
RETURNING id
```

**作用：**
- 处理极少数并发竞态情况
- 遇到重复时更新时间戳而不是报错

### 4. Payment 失败时清理 mint queue (payment-processor.ts)

```typescript
// Payment 失败时自动清理对应的 mint queue items
UPDATE mint_queue 
SET status = 'failed', error_message = 'Payment failed: ...'
WHERE ... payment 匹配条件
```

**作用：**
- 防止 payment 失败但 mint queue 仍然 pending
- 保持数据一致性

---

## 🔧 诊断和清理工具

### 1. 查询 pending mints 和重复项

```bash
node query-pending-mints.cjs
```

**检查：**
- 重复的 tx_hash_bytes32
- pending/processing items 数量
- 卡住的 items

### 2. 诊断 payment/mint 不匹配

```bash
node diagnose-queue-mismatch.cjs
```

**检查：**
- Payment failed 但 mint 仍然 pending
- 数据一致性问题

### 3. 手动重置卡住的 items

```bash
node reset-stuck-processing.cjs
```

**作用：**
- 手动将 'processing' items 重置为 'pending'
- 用于处理历史遗留问题

### 4. 清理失败 payment 的 orphaned mints

```bash
node cleanup-failed-mints.cjs
```

**作用：**
- 清理 payment 失败但 mint queue 仍然 pending 的条目

---

## 📋 部署清单

### 1. 清理历史脏数据

```bash
cd /Users/daniel/code/402/token-mint/server

# 1. 诊断当前状态
node query-pending-mints.cjs
node diagnose-queue-mismatch.cjs

# 2. 如果发现问题，运行清理
node reset-stuck-processing.cjs      # 重置 processing → pending
node cleanup-failed-mints.cjs        # 清理 failed payments 的 mints
```

### 2. 编译和部署新代码

```bash
# 编译
npm run build

# 重启服务
pm2 restart all

# 检查日志
pm2 logs --lines 100
```

### 3. 验证修复

**观察日志输出：**
```
🔄 Starting mint queue processor...
   🔄 Reset 5 stuck 'processing' items back to 'pending'
      - abc12345 (0x1234...)
      - def67890 (0x5678...)
      ...
```

**运行诊断：**
```bash
# 等待几分钟后检查
node query-pending-mints.cjs
```

应该看到：
- ✅ No duplicate tx_hash_bytes32 found
- ✅ No stuck processing items

---

## 🎯 预防措施

### 数据库层面
- ✅ `tx_hash_bytes32 UNIQUE` 约束防止重复
- ✅ 服务启动时自动重置 'processing' items

### 代码层面
- ✅ 批处理失败时精确标记
- ✅ INSERT 时处理冲突
- ✅ Payment 失败自动清理 mint queue

### 链上层面
- ✅ 合约的 `hasMinted(txHash)` 检查
- ✅ 合约的 `hasMinted` mapping 防止重复 mint

---

## 🔍 持续监控

### 定期检查脚本 (添加到 cron)

```bash
# 每小时检查一次
0 * * * * cd /path/to/server && node query-pending-mints.cjs > /tmp/mint-queue-check.log 2>&1
```

### 监控指标
- Pending items 数量
- Processing items 停留时间
- Failed items 比率

### 告警条件
- Processing items > 100 且停留时间 > 10分钟
- Pending items > 1000
- 发现重复的 tx_hash_bytes32

---

## 📊 测试场景

### 场景 1: 服务重启

1. 发起几个 mint 请求
2. 在处理过程中 kill 服务
3. 重启服务
4. 检查日志：应该看到 "Reset X stuck items"
5. 检查这些 items 应该被重新处理

### 场景 2: 批处理失败

1. 模拟链上错误（如余额不足）
2. 检查只有失败的 batch 被标记为 failed
3. 其他 pending items 不受影响

### 场景 3: 并发请求

1. 同时发起多个相同的 mint 请求
2. 检查只有一个成功添加到队列
3. 其他请求返回已存在的 queue ID

---

## 🚨 如果还是出现重复

### 可能的原因

1. **时间戳碰撞**（极低概率）
   - 同一用户在同一毫秒内多次请求
   - 解决：添加随机数到 generateMintTxHash

2. **数据库事务隔离问题**
   - 并发 INSERT 在 UNIQUE 约束检查前
   - 解决：使用更严格的隔离级别

3. **链上和链下状态不同步**
   - 数据库认为已 mint，但链上失败
   - 解决：定期同步链上状态

### 紧急处理

```bash
# 1. 查询重复的 tx_hash_bytes32
node query-pending-mints.cjs

# 2. 手动删除重复条目（保留最早的）
psql $DATABASE_URL -c "
DELETE FROM mint_queue 
WHERE id NOT IN (
  SELECT MIN(id) 
  FROM mint_queue 
  GROUP BY tx_hash_bytes32
)
AND status = 'pending'
"
```

---

## 📞 联系信息

如有问题，请检查：
1. PM2 logs: `pm2 logs`
2. 数据库状态：运行诊断脚本
3. 链上状态：检查 Basescan

维护者：0x402 Team

