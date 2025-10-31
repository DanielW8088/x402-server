# Mint Queue 性能分析指南

## 🔍 问题症状

16秒/批的处理速度，明显慢于预期。

---

## ⏱️  详细性能日志（已添加）

重新编译部署后，日志会显示每个步骤的耗时：

```bash
pm2 logs | grep "⏱️"
```

### 示例日志输出：

```
📦 Processing batch of 100 mint(s)...
   ⏱️  [0ms] Starting batch for 0x1234567... (100 items)
   🔍 Checking 80/100 older items for duplicates...
   ⏱️  [2500ms] hasMinted checks done (took 2500ms)        ← RPC 瓶颈？
   ⏱️  [2600ms] DB updated to 'processing'
   ⏱️  [2610ms] Got nonce: 123
   ⏱️  [2850ms] Supply checked (took 240ms)                ← RPC 瓶颈？
   ✅ Tx sent: 0xabcdef...
   ⏱️  [3200ms] Transaction sent (gas estimate took 350ms)
   ⏳ Waiting for confirmation...
   ⏱️  [8200ms] Confirmed! (wait took 5000ms)              ← 区块确认时间
   ⏱️  [8600ms] DB updated (took 400ms)
   🎯 Total batch time: 8600ms

下一批等待时间: 1500ms (batchInterval)
总周期: 10.1秒
```

---

## 📊 性能瓶颈检测

### 1. **批处理间隔过长**

**症状：**
```
🔄 Starting mint queue processor (batch interval: 10000ms, max batch: 500)
```

**问题：** 硬编码的 10秒还在使用

**解决：** 检查是否编译部署了新代码（batchInterval = 1500）

```bash
# 查看启动日志
pm2 logs | grep "Starting mint"

# 应该看到:
🔄 Starting mint queue processor (batch interval: 1500ms, max batch: 400)
```

---

### 2. **hasMinted 检查过慢**

**症状：**
```
⏱️  [2500ms] hasMinted checks done (took 2500ms)
```

**原因：**
- 检查了太多老的 items（>30秒）
- RPC 节点慢或限流

**优化：**
- ✅ 已实现：只检查 >30秒的 items
- 确保大部分 items 都是新的（<30秒创建）

**预期：**
- 新 items (0个检查): 0ms
- 少量老 items (10个检查): 200-500ms

---

### 3. **Supply 检查过慢**

**症状：**
```
⏱️  [2850ms] Supply checked (took 2400ms)
```

**原因：**
- RPC 节点响应慢
- 网络延迟

**解决：**
- 使用更快的 RPC 节点
- 考虑缓存 supply（风险：可能过时）

**预期：** 100-300ms

---

### 4. **交易确认时间长**

**症状：**
```
⏱️  [15000ms] Confirmed! (wait took 12000ms)
```

**原因：**
- Base 链出块慢（正常 2-3秒）
- Gas 价格设置太低，交易卡在 mempool
- 网络拥堵

**正常范围：**
- Base: 2-5秒
- Ethereum: 15-30秒

**如果 >10秒：** 检查 Gas 设置

---

### 5. **数据库更新慢**

**症状：**
```
⏱️  [8600ms] DB updated (took 2000ms)
```

**原因：**
- 批量大，需要更新 100+ 行
- 数据库连接慢
- 索引缺失

**优化：**
- 使用 bulk insert/update
- 检查数据库索引
- 增加 DB 连接池

**预期：** 200-600ms (100 items)

---

## 🎯 理想的时间分配

### 目标：6秒/批（400 items）

| 步骤 | 时间 | 占比 |
|------|------|------|
| hasMinted 检查 | 0-500ms | 8% |
| Supply 检查 | 200ms | 3% |
| Gas 估算 | 300ms | 5% |
| 发送交易 | 200ms | 3% |
| **等待确认** | **4000ms** | **67%** |
| DB 更新 | 400ms | 7% |
| 批处理间隔 | 1500ms | - |
| **总计** | **~7秒** | - |

**吞吐量：** (60/7) × 400 = ~3,400 mints/分钟

---

## 🚀 部署和监控

### 1. 编译部署

```bash
cd /home/x402/x402-server/server

# 编译
npm run build

# 重启
pm2 restart all

# 实时查看日志
pm2 logs --lines 0
```

### 2. 查看性能日志

```bash
# 查看时间分解
pm2 logs | grep "⏱️" | tail -20

# 查看批次总时间
pm2 logs | grep "Total batch time" | tail -10

# 查找慢的批次 (>10秒)
pm2 logs | grep "Total batch time" | awk '$6 > 10000 {print}'
```

### 3. 分析瓶颈

```bash
# 统计各步骤平均时间
pm2 logs | grep "hasMinted checks done" | sed 's/.*took \([0-9]*\)ms.*/\1/' | awk '{sum+=$1; n++} END {print "Avg hasMinted:", sum/n, "ms"}'

pm2 logs | grep "Confirmed! (wait took" | sed 's/.*took \([0-9]*\)ms.*/\1/' | awk '{sum+=$1; n++} END {print "Avg confirmation:", sum/n, "ms"}'

pm2 logs | grep "DB updated (took" | sed 's/.*took \([0-9]*\)ms.*/\1/' | awk '{sum+=$1; n++} END {print "Avg DB update:", sum/n, "ms"}'
```

---

## 🔧 根据日志调优

### 场景 1: hasMinted 检查占主要时间

**日志：**
```
⏱️  [3000ms] hasMinted checks done (took 3000ms)
⏱️  [7000ms] Confirmed! (wait took 4000ms)
```

**问题：** 检查了太多老 items

**解决：**
1. 检查为什么有这么多老 items（>30秒）
2. 可能之前积压太多，正在清理中
3. 考虑提高 30秒阈值到 60秒

---

### 场景 2: 等待确认占主要时间

**日志：**
```
⏱️  [200ms] hasMinted checks done (took 200ms)
⏱️  [12000ms] Confirmed! (wait took 11800ms)
```

**问题：** 区块确认慢

**解决：**
1. 检查 Gas 价格设置
2. 检查网络状态
3. 考虑使用更快的 RPC
4. 降低 confirmations（风险：可能回滚）

---

### 场景 3: DB 更新占主要时间

**日志：**
```
⏱️  [5000ms] Confirmed! (wait took 4000ms)
⏱️  [8000ms] DB updated (took 3000ms)
```

**问题：** 数据库写入慢

**解决：**
1. 检查数据库负载
2. 优化索引
3. 使用 bulk operations
4. 增加 DB 连接池

---

## 📈 监控仪表板命令

```bash
# 实时性能监控
watch -n 2 '
echo "=== Recent Batch Times ==="
pm2 logs --nostream --lines 50 | grep "Total batch time" | tail -5
echo ""
echo "=== Average Confirmation Time (last 10) ==="
pm2 logs --nostream --lines 500 | grep "wait took" | tail -10 | sed "s/.*took \([0-9]*\)ms.*/\1/" | awk "{sum+=\$1; n++} END {print sum/n, \"ms\"}"
echo ""
echo "=== Queue Status ==="
psql $DATABASE_URL -c "SELECT status, COUNT(*) FROM mint_queue GROUP BY status;"
'
```

---

## 🎯 性能目标

| 指标 | 目标 | 可接受 | 需优化 |
|------|------|--------|--------|
| 批次总时间 | <7秒 | 7-10秒 | >10秒 |
| hasMinted 检查 | <500ms | 500-1000ms | >1000ms |
| 等待确认 | 2-5秒 | 5-8秒 | >8秒 |
| DB 更新 | <600ms | 600-1000ms | >1000ms |
| 吞吐量 | >3000/分 | 2000-3000/分 | <2000/分 |

---

## 📞 故障排查

如果仍然 16秒/批：

1. **确认新代码生效：**
   ```bash
   pm2 logs | grep "batch interval" | tail -1
   # 应该看到 1500ms，不是 10000ms
   ```

2. **检查是否有多个 token 串行处理：**
   ```bash
   pm2 logs | grep "Processing.*token" | tail -5
   # 如果看到多个 token，检查是否并行
   ```

3. **查看完整批次日志：**
   ```bash
   pm2 logs --lines 200 | grep -A 20 "Processing batch"
   ```

4. **发送日志给开发者分析**

---

维护者：0x402 Team  
更新日期：2025-10-31

