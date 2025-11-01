# 🔧 关键修复：SQL 查询缺少 recipient 字段

## 问题根源

在 `queue/processor.ts` 的 `processBatch()` 函数中，SQL 查询**没有 SELECT `recipient` 字段**！

### 错误的 SQL（第 266-276 行）
```sql
SELECT bc.id, bc.payer_address, bc.tx_hash_bytes32, ...
-- ❌ 缺少 recipient!
```

### 修复后的 SQL
```sql
SELECT bc.id, bc.payer_address, bc.recipient, bc.tx_hash_bytes32, ...
-- ✅ 添加 recipient!
```

## 数据流

### 修复前
```
1. Database: recipient = 0x7382... ✅
2. SQL Query: SELECT ... (no recipient) ❌
3. Code: item.recipient = undefined
4. addressesToProcess = item.payer_address (0x2950...) ❌
5. mint(0x2950..., txHash) ❌ 错误！
```

### 修复后
```
1. Database: recipient = 0x7382... ✅
2. SQL Query: SELECT recipient ✅
3. Code: item.recipient = 0x7382... ✅
4. addressesToProcess = item.recipient (0x7382...) ✅
5. mint(0x7382..., txHash) ✅ 正确！
```

## 修复内容

### 文件：queue/processor.ts

#### 1. 添加 recipient 到 SQL SELECT（Line 266, 276）
```typescript
// Line 266
SELECT id, payer_address, recipient, tx_hash_bytes32, ...

// Line 276
SELECT bc.id, bc.payer_address, bc.recipient, bc.tx_hash_bytes32, ...
```

#### 2. 添加调试日志（Line 418-421）
```typescript
console.log(`   🎯 Mint recipients:`);
itemsToProcess.forEach((item, i) => {
  console.log(`      ${i + 1}. Payer: ${item.payer_address.slice(0, 10)}... → Recipient: ${(item.recipient || item.payer_address).slice(0, 10)}... ${item.recipient && item.payer_address !== item.recipient ? '✅ DIFFERENT' : '❌ SAME'}`);
});
```

## 重新部署

```bash
cd /Users/daniel/code/402/token-mint/server

# 1. 编译
npm run build

# 2. 重启
pm2 restart token-mint-server

# 3. 查看日志
pm2 logs token-mint-server --lines 50
```

## 验证

创建新任务后，应该看到：

```
📦 Processing batch of 1 mint(s)...
   🎯 Mint recipients:
      1. Payer: 0x29508ecF... → Recipient: 0x7382A3A9... ✅ DIFFERENT
```

然后在区块链浏览器查看交易的 Input Data：
- `to` 应该是 `0x7382...` (User) ✅
- 而不是 `0x2950...` (Agent) ❌

## 为什么之前没发现

1. ✅ 数据库中 `recipient` 字段已经正确
2. ✅ 代码中 `item.recipient || item.payer_address` 逻辑正确
3. ❌ 但是 SQL 查询没有 SELECT `recipient`，所以 `item.recipient` 永远是 `undefined`！

这是一个经典的"数据库有数据，但代码没读取"的问题。

