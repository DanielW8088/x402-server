# LP部署自动重试机制

## 🔄 功能说明

LP部署失败后会自动重试，无需手动干预。

## ⚙️ 重试策略

### 重试条件
- ✅ 失败超过 **5分钟** 后才重试
- ✅ 最多重试 **5次**
- ✅ 每次检查周期（15秒）会检测可重试的token

### 重试流程
```
1. LP部署失败
   ↓
2. 记录错误信息和时间
   ↓
3. 等待5分钟
   ↓
4. 自动重试 (清除错误标记)
   ↓
5. 成功 → 完成！
   失败 → 重复步骤2-4 (最多5次)
   ↓
6. 5次失败后 → 需要手动介入
```

## 📊 数据库字段

```sql
-- 新增字段
lp_retry_count INTEGER DEFAULT 0    -- 重试次数
lp_deployment_error TEXT             -- 错误信息
lp_deployment_error_at TIMESTAMP     -- 错误时间
```

## 🔧 使用方法

### 1. 运行数据库迁移
```bash
cd server
psql $DATABASE_URL -f db/add-lp-retry-count.sql
```

### 2. 重启服务器
```bash
npm run dev:multi-token
```

### 3. 自动运行
无需任何操作，系统会自动：
- 检测失败的LP部署
- 等待5分钟后重试
- 显示重试进度

## 📝 日志示例

### 首次失败
```
❌ LP deployment failed for MTK: insufficient funds for gas
   🔄 Will retry automatically (1/5)
```

### 自动重试
```
🔍 Checking 3 token(s) for LP deployment readiness...
   🔄 Retrying MTK (attempt 2/5)...
   📊 MTK: 10/10 mints (100.0%)

💧 Deploying LP for MTK...
   ✅ LP position minted successfully!
```

### 达到最大重试次数
```
❌ LP deployment failed for MTK: still insufficient funds
   ⛔ Max retries (5) reached. Manual intervention required.
```

## 🔍 查询状态

### SQL查询
```sql
-- 查看所有失败和重试中的token
SELECT 
  symbol,
  lp_deployment_error,
  lp_retry_count,
  lp_deployment_error_at,
  EXTRACT(EPOCH FROM (NOW() - lp_deployment_error_at))/60 as minutes_since_error
FROM deployed_tokens
WHERE liquidity_deployed = false 
  AND lp_deployment_error IS NOT NULL
ORDER BY lp_deployment_error_at DESC;
```

### API查询
```bash
# 查看token状态
curl http://localhost:3002/api/tokens/0xTokenAddress | jq '{
  symbol,
  liquidityDeployed,
  lpDeploymentError,
  lpRetryCount
}'
```

## 🛠️ 手动操作

### 立即重试（跳过5分钟等待）
```sql
-- 清除错误状态，立即触发重试
UPDATE deployed_tokens 
SET lp_deployment_error = NULL,
    lp_deployment_error_at = NULL,
    lp_retry_count = 0
WHERE address = '0xTokenAddress';

-- 重启服务器或等待下一个检查周期（15秒）
```

### 查看错误详情
```sql
SELECT 
  address,
  symbol,
  lp_deployment_error,
  lp_retry_count,
  lp_deployment_error_at
FROM deployed_tokens
WHERE address = '0xTokenAddress';
```

### 重置重试计数
```sql
-- 如果需要重新开始计数
UPDATE deployed_tokens 
SET lp_retry_count = 0
WHERE address = '0xTokenAddress';
```

## 🐛 常见失败原因及解决方案

### 1. insufficient funds for gas
**原因**: LP部署地址没有ETH

**解决**:
```bash
# 给LP部署地址转ETH
cast send 0xLpDeployerAddress \
  --value 0.01ether \
  --private-key YOUR_KEY \
  --rpc-url https://sepolia.base.org
```

**自动重试**: ✅ 转账后会自动重试

### 2. replacement transaction underpriced
**原因**: Gas price太低或nonce冲突

**解决**: 等待几分钟，系统会自动重试（已提高gas price buffer）

**自动重试**: ✅ 会自动重试

### 3. Pool already initialized
**原因**: Pool已存在但LP部署失败

**解决**: 系统会自动跳过pool创建，直接部署LP

**自动重试**: ✅ 会自动重试

### 4. Token balance insufficient
**原因**: 合约token余额不足

**解决**: 检查`transferAssetsForLP()`是否成功执行

**自动重试**: ✅ 会自动重试

### 5. Max retries reached
**原因**: 5次重试都失败了

**解决**: 需要手动排查问题
```bash
# 1. 检查LP部署地址余额
cast balance 0xLpDeployerAddress --rpc-url $RPC

# 2. 检查token余额
cast call $TOKEN "balanceOf(address)" 0xLpDeployerAddress --rpc-url $RPC

# 3. 检查错误日志
psql $DATABASE_URL -c "SELECT lp_deployment_error FROM deployed_tokens WHERE address = '$TOKEN'"

# 4. 解决问题后重置重试计数
psql $DATABASE_URL -c "UPDATE deployed_tokens SET lp_retry_count = 0, lp_deployment_error = NULL WHERE address = '$TOKEN'"
```

**自动重试**: ❌ 需要手动重置后才会重试

## ⚙️ 配置参数

可以修改这些参数（在`lpDeployerSimple.ts`中）:

```typescript
// 重试等待时间（当前: 5分钟）
lp_deployment_error_at < NOW() - INTERVAL '5 minutes'

// 最大重试次数（当前: 5次）
const maxRetries = 5;

// 检查间隔（当前: 15秒）
private checkInterval: number = 15000;
```

## 📈 监控重试

### 实时监控
```bash
# 持续监控
watch -n 5 "psql $DATABASE_URL -c \"
SELECT symbol, lp_retry_count, 
       EXTRACT(EPOCH FROM (NOW() - lp_deployment_error_at))/60 as mins_ago
FROM deployed_tokens 
WHERE lp_deployment_error IS NOT NULL
\""
```

### 统计
```sql
-- 重试统计
SELECT 
  lp_retry_count,
  COUNT(*) as count,
  array_agg(symbol) as tokens
FROM deployed_tokens
WHERE lp_deployment_error IS NOT NULL
GROUP BY lp_retry_count
ORDER BY lp_retry_count;
```

## ✅ 测试重试机制

```bash
# 1. 部署一个token
curl -X POST http://localhost:3002/api/deploy -d '{...}'

# 2. 完成所有mints
# ...

# 3. 不给LP部署地址转ETH，让它失败
# 观察日志：
#   ❌ LP deployment failed: insufficient funds
#   🔄 Will retry automatically (1/5)

# 4. 等待5分钟，观察自动重试
# 日志会显示：
#   🔄 Retrying MTK (attempt 2/5)...

# 5. 转ETH到LP部署地址
cast send 0xLpDeployer --value 0.01ether ...

# 6. 观察下一次重试成功
#   ✅ LP position minted successfully!
```

## 🎯 优势

1. **自动化** - 无需人工干预
2. **容错性** - 临时问题会自动恢复
3. **可追溯** - 完整的错误和重试记录
4. **可配置** - 可调整重试策略
5. **防护性** - 有最大重试次数限制

## 🔗 相关文档

- [SIMPLE_LP_DEPLOYMENT.md](SIMPLE_LP_DEPLOYMENT.md) - LP部署方案
- [QUICK_START_SIMPLE.md](QUICK_START_SIMPLE.md) - 快速开始
- [server/services/lpDeployerSimple.ts](server/services/lpDeployerSimple.ts) - 实现代码

---

**自动重试让LP部署更加可靠！** 🔄✨

