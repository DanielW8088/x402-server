# Quick Start: Async Payment Processing

## 🎯 问题

当前payment processor在大量请求时很慢：
- **症状**: 批次设置为50，但仍然2秒才发送一条消息
- **原因**: 每个tx发送后等待60秒确认，阻塞整个批次
- **结果**: 100个pending payments需要40+秒处理

## ✅ 解决方案

**异步发送 + 后台确认**

1. 发送tx → 立即标记为`sent` → 继续下一个（不等待确认）
2. 独立的确认循环后台检查`sent`交易
3. 确认成功 → 触发callback → 标记`completed`

**性能提升: 10x faster**
- 50个tx: 60秒 → 5秒
- 100个tx: 40秒 → 8秒

## 🚀 部署步骤 (3分钟)

### 1. 应用数据库migration

```bash
cd /Users/daniel/code/402/token-mint/server
./apply-async-payment-migration.sh
```

或手动:
```bash
psql $DATABASE_URL -f db/migrations/006_update_payment_queue_status.sql
```

### 2. 重新编译

```bash
npm run build
```

### 3. 重启服务

```bash
pm2 restart token-mint-server
# 或
./quick-restart.sh
```

### 4. 验证

```bash
# 查看日志
pm2 logs token-mint-server --lines 50

# 应该看到:
# 📤 Sent payment tx: abc12345... (nonce: 123)
# 🔍 Checking 20 pending confirmations...
# ✅ 18 confirmed

# 测试性能
./test-async-payment.sh
```

## 📊 监控

### 检查队列状态

```bash
# 快速查看
psql $DATABASE_URL -c "SELECT status, COUNT(*) FROM payment_queue GROUP BY status;"
```

期望结果:
```
     status          | count 
--------------------+-------
 pending            |   150  ← 等待发送
 sent               |    20  ← 已发送，等待确认
 completed          |  5000  ← 已完成
 failed             |     2  ← 发送失败
 confirmation_failed|     1  ← 确认超时
```

### 检查性能

```bash
./test-async-payment.sh
```

应该看到:
- `avg_seconds` < 15秒 (之前是60+秒)
- 每秒处理 10+ payments (之前是0.8/秒)

## ⚙️ 性能调优

### 当前有大量pending (1000+):

```bash
# 进入数据库
psql $DATABASE_URL

# 增加批次大小
UPDATE system_settings SET value = '100' WHERE key = 'payment_batch_size';

# 减少批次间隔
UPDATE system_settings SET value = '1000' WHERE key = 'payment_batch_interval_ms';

# 重启
```

然后 `pm2 restart token-mint-server`

**效果**: 1000 pending → ~10-15秒全部发送

### 正常负载:

保持默认:
- `payment_batch_size`: 50
- `payment_batch_interval_ms`: 4000

## 🔍 故障排查

### 问题: Transactions卡在'sent'状态

```bash
# 查看卡住的tx
psql $DATABASE_URL -c "
  SELECT id, tx_hash, processed_at, 
         EXTRACT(EPOCH FROM (NOW() - processed_at)) as seconds_waiting
  FROM payment_queue 
  WHERE status = 'sent' 
  ORDER BY processed_at ASC;
"

# 如果超过5分钟，手动重置
node reset-payment-stuck.cjs
```

### 问题: 高confirmation_failed率

**可能原因**:
1. RPC节点慢/不稳定
2. 网络拥堵
3. Gas设置太低

**检查**:
```bash
# 查看失败原因
psql $DATABASE_URL -c "
  SELECT error, COUNT(*) 
  FROM payment_queue 
  WHERE status = 'confirmation_failed' 
  GROUP BY error;
"
```

### 问题: Minting没有触发

**原因**: Callback在confirmation时触发

**检查**:
```bash
# 查看日志中的callback错误
pm2 logs | grep "Payment callback failed"

# 检查mint队列
psql $DATABASE_URL -c "SELECT status, COUNT(*) FROM mint_queue GROUP BY status;"
```

## 📈 新状态流程

```
pending         → 在队列中等待
    ↓
processing      → 正在发送tx
    ↓
sent            → tx已发送，等待确认 (NEW!)
    ↓
completed       → tx确认成功，callback已执行
    OR
confirmation_failed  → tx超时或revert (NEW!)
```

**关键差异**:
- **旧**: `processing` → (等待60秒) → `completed`
- **新**: `processing` → `sent` → (后台确认) → `completed`

## 🎓 技术细节

### 发送循环 (每4秒)
1. 获取50个pending payments
2. 预分配连续nonces
3. 并发发送所有tx
4. 标记为`sent`
5. 立即返回 (不等待确认)

### 确认循环 (每2秒)
1. 获取20个`sent` payments
2. 并发检查所有receipts
3. 确认成功 → 触发callback → 标记`completed`
4. 确认失败 → 标记`confirmation_failed`

### 优势
- ✅ 发送和确认解耦
- ✅ 高并发发送
- ✅ 不阻塞队列
- ✅ 自动重试机制
- ✅ Nonce管理安全

## 📚 相关文档

- 详细文档: `ASYNC_PAYMENT_UPGRADE.md`
- Nonce问题: `NONCE_TROUBLESHOOTING.md`
- PM2管理: `PM2_GUIDE.md`
- API文档: `API_QUICK_REFERENCE.md`

## 🆘 回滚

如果遇到严重问题:

```bash
# 1. 停止服务
pm2 stop token-mint-server

# 2. 回滚代码
cd /Users/daniel/code/402/token-mint
git checkout HEAD~1 -- server/queue/payment-processor.ts server/index-multi-token.ts
cd server && npm run build

# 3. 清理stuck状态
psql $DATABASE_URL -c "
  UPDATE payment_queue 
  SET status = 'failed', error = 'Rollback to sync mode'
  WHERE status = 'sent';
"

# 4. 重启
pm2 restart token-mint-server
```

## ✨ 期望效果

部署后你应该看到:

1. **日志变化**:
```
📤 Sent payment tx: abc12345... (nonce: 123, tx: 0x1234...)
📤 Sent payment tx: def67890... (nonce: 124, tx: 0x5678...)
✅ Batch complete: 50 succeeded
🔍 Checking 20 pending confirmations...
   ✅ 18 confirmed
```

2. **性能提升**:
- Pending队列快速下降
- 处理速度提升10-50倍
- 用户等待时间减少

3. **数据库变化**:
- `sent` 状态出现 (正常，短暂存在)
- `completed` 增长速度加快
- `avg_seconds` 显著降低

---

**准备好了吗? 开始部署!** 🚀

