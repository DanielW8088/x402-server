# 重复 Mint 问题修复 (收1U发2次)

## 🐛 严重Bug：Traditional Payment Mode 重复添加 Mint

### 问题描述

**症状：** 用户只支付1U，但收到2次（或 2x quantity）的 mint tokens

**影响范围：** **仅影响 Traditional Payment Mode**（直接 EIP-3009），不影响 x402 mode

---

## 🔍 问题根源分析

### Traditional Payment Mode 的双重添加

#### 第一次添加：Payment Callback (第 310-336 行)

```typescript
// payment-processor.ts 中的回调函数
paymentQueueProcessor = new PaymentQueueProcessor(
  pool,
  walletClient,
  publicClient,
  chain,
  account,
  async (item, txHash) => {  // ← 回调函数
    if (item.payment_type === 'mint' && item.metadata) {
      const { quantity } = item.metadata;
      
      // 第一次添加：根据 quantity 添加 mints
      for (let i = 0; i < quantity; i++) {
        await queueProcessor.addToQueue(...);  // ✓ 正确
      }
    }
  }
);
```

#### 第二次添加：主 API 流程 (第 1398-1429 行)

```typescript
// index-multi-token.ts 中的主流程
// Traditional payment 等待完成后
if (!paymentTxHash) { ... }

// 第二次添加：又根据 quantity 添加 mints！
for (let i = 0; i < quantity; i++) {  // ⚠️ 重复！
  await queueProcessor.addToQueue(...);
}
```

### 为什么 x402 Mode 没问题？

x402 mode 不使用 payment queue callback，直接在主流程添加 mints，所以只添加一次。

---

## ✅ 修复方案

### 修改内容 (index-multi-token.ts)

**Traditional payment 完成后立即返回，不再继续执行后续的 mint 添加逻辑。**

```typescript
// Traditional payment mode 完成后
if (!paymentTxHash) {
  return res.status(408).json({ ... });
}

// 🔧 FIX: Return early, mints are added by callback
console.log(`✅ Traditional payment completed, mints will be added by callback`);

// 等待 callback 创建 mint queue items
let mintQueueItems = await poll for mints...

// 返回 callback 创建的 queue IDs
return res.status(200).json({
  queueId: callbackQueueIds[0],
  queueIds: callbackQueueIds,
  quantity: callbackQueueIds.length,
  ...
});
// ← 不再继续执行下面的 for loop

// 🔧 下面的代码只为 x402 mode 执行
// x402 payment mode continues here
for (let i = 0; i < quantity; i++) {
  await queueProcessor.addToQueue(...);
}
```

---

## 📊 检测和诊断

### 1. 检查是否存在重复 mints

```bash
node check-duplicate-mints.cjs
```

**检查内容：**
- 同一个 payment_tx_hash 对应多个 mint queue entries
- Traditional payment 的 mint 数量超过 metadata.quantity
- 统计：总共有多少 extra mints

### 2. 查看示例输出

```
🚨 Found 15 payments with multiple mints:

1. Payment TX: 0x1234567...
   Payer: 0xabcd...
   Mint Count: 2 (⚠️ expected 1 for 1U payment)
   Statuses: completed, completed
   Time Diff: 1s

⚠️  Total duplicate mints: 15
💰 If each mint = 1U, users received 15 extra mints for free
```

---

## 🚀 部署步骤

### 1. 检查历史脏数据

```bash
cd /Users/daniel/code/402/token-mint/server

# 检查是否存在重复 mints
node check-duplicate-mints.cjs
```

### 2. 编译新代码

```bash
npm run build
```

### 3. 重启服务

```bash
pm2 restart all
```

### 4. 验证修复

**测试 Traditional Payment Mode：**
1. 使用 traditional EIP-3009 payment 发起 mint
2. 检查数据库：应该只有 quantity 个 mint queue entries

```sql
-- 检查最近的 payment
SELECT 
  pq.tx_hash as payment_tx,
  pq.metadata->>'quantity' as expected,
  COUNT(mq.id) as actual_mints
FROM payment_queue pq
LEFT JOIN mint_queue mq ON mq.payment_tx_hash = pq.tx_hash
WHERE pq.payment_type = 'mint'
AND pq.status = 'completed'
AND pq.created_at > NOW() - INTERVAL '10 minutes'
GROUP BY pq.tx_hash, pq.metadata
ORDER BY pq.created_at DESC;
```

**预期结果：** `expected = actual_mints`

---

## 🔧 清理历史重复数据（可选）

如果发现历史上有重复的 mints：

### 方案 1：标记为 failed（保守）

```sql
-- 保留每个 payment 的第一个 mint，标记其他为 failed
WITH numbered_mints AS (
  SELECT 
    id,
    payment_tx_hash,
    ROW_NUMBER() OVER (
      PARTITION BY payment_tx_hash, payer_address 
      ORDER BY created_at ASC
    ) as rn
  FROM mint_queue
  WHERE payment_tx_hash IS NOT NULL
  AND status IN ('pending', 'processing')
)
UPDATE mint_queue mq
SET status = 'failed', 
    error_message = 'Duplicate mint (fixed bug)',
    updated_at = NOW()
FROM numbered_mints nm
WHERE mq.id = nm.id
AND nm.rn > 1;
```

### 方案 2：删除重复（激进）

```sql
-- 删除重复的 pending mints（保留第一个）
DELETE FROM mint_queue
WHERE id IN (
  SELECT id FROM (
    SELECT 
      id,
      ROW_NUMBER() OVER (
        PARTITION BY payment_tx_hash, payer_address 
        ORDER BY created_at ASC
      ) as rn
    FROM mint_queue
    WHERE payment_tx_hash IS NOT NULL
    AND status = 'pending'
  ) subq
  WHERE rn > 1
);
```

---

## 📈 监控指标

### 定期检查（添加到 cron）

```bash
# 每小时检查一次
0 * * * * cd /path/to/server && node check-duplicate-mints.cjs >> /tmp/duplicate-check.log 2>&1
```

### 告警条件

- 发现任何 payment_tx_hash 对应超过 1 个 mint（单次 mint 场景）
- Traditional payment 的 mint 数量 ≠ metadata.quantity

---

## ✅ 修复验证清单

- [ ] 运行 `check-duplicate-mints.cjs` 检查历史数据
- [ ] 编译新代码 `npm run build`
- [ ] 重启服务 `pm2 restart all`
- [ ] 测试 traditional payment mode（如果使用）
- [ ] 测试 x402 payment mode（确保没有影响）
- [ ] 检查日志：`pm2 logs | grep "Traditional payment completed"`
- [ ] 验证新的 mints 没有重复
- [ ] （可选）清理历史重复数据

---

## 🎯 影响评估

### 修复前（Bug 存在）

- **Traditional Payment Mode**: 
  - 1U payment → 2 个 mints
  - 10U payment (quantity=10) → 20 个 mints
  - 用户多收到 100% 的 tokens

- **x402 Payment Mode**:
  - ✅ 正常（无影响）

### 修复后

- **Traditional Payment Mode**:
  - 1U payment → 1 个 mint ✅
  - 10U payment (quantity=10) → 10 个 mints ✅

- **x402 Payment Mode**:
  - ✅ 正常（无变化）

---

## 💡 预防措施

### 代码层面

1. ✅ Traditional payment 完成后立即返回
2. ✅ 添加注释说明两种 mode 的不同处理方式
3. ✅ 添加诊断工具检测重复

### 测试层面

1. 测试 traditional payment 单次 mint
2. 测试 traditional payment 批量 mint (quantity > 1)
3. 测试 x402 payment 各种场景
4. 定期运行 `check-duplicate-mints.cjs`

### 监控层面

1. 监控 mint_queue 的 payment_tx_hash 重复率
2. 告警：发现重复立即通知
3. 定期对账：payment 数量 vs mint 数量

---

## 📞 如有问题

1. 检查日志：`pm2 logs`
2. 运行诊断：`node check-duplicate-mints.cjs`
3. 检查数据库状态
4. 联系开发团队

---

维护者：0x402 Team  
修复日期：2025-01-XX

