# Contract Verification Guide

自动部署的合约如何在 Basescan 上开源验证。

## 概览

系统会在部署时自动保存合约验证所需的所有数据：
- 构造函数参数
- 编译器版本和配置
- 部署交易信息

## 快速开始

### 1. 数据库迁移 - 添加验证字段

首次使用前需要运行迁移：

```bash
cd server
npm run db:migrate-verification
```

或手动执行：

```bash
psql $DATABASE_URL -f db/add-verification-fields.sql
```

### 2. 配置 Basescan API Key

在 `contracts/.env` 中添加：

```bash
BASESCAN_API_KEY=你的API密钥
```

获取 API Key：
- Base Mainnet: https://basescan.org/myapikey
- Base Sepolia: https://sepolia.basescan.org/myapikey

### 3. 批量验证合约

```bash
# 验证所有未验证的合约
npm run verify

# 只验证 Base Mainnet 上的合约
npm run verify:base

# 只验证 Base Sepolia 上的合约
npm run verify:sepolia

# 验证指定合约
npm run verify -- --address=0x123...

# 自定义延迟（默认 10 秒）
npm run verify -- --delay=5000

# 限制最大重试次数（跳过已失败多次的合约）
npm run verify -- --max-retries=3

# 组合参数
npm run verify -- --network=base --delay=15000 --max-retries=5
```

**批量验证特性：**
- ✅ **失败跳过** - 验证失败不会中断批量处理
- 📝 **错误记录** - 所有错误都保存到数据库
- 🔄 **重试追踪** - 自动记录重试次数和时间
- ⏭️ **智能过滤** - 可跳过已失败多次的合约
- 📊 **详细报告** - 结束时显示失败详情

## 工作流程

### 部署时自动保存验证数据

当通过 API 部署新合约时，系统会自动：

1. **生成部署脚本** - 包含所有构造函数参数
2. **执行部署** - 部署合约到链上
3. **保存到数据库** - 存储验证所需的所有信息

```typescript
// 部署时自动保存
{
  constructor_args: {
    name: "MyToken",
    symbol: "MTK",
    mintAmount: "10000000000000000000000",
    maxMintCount: 10000,
    paymentToken: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    pricePerMint: "1000000",
    poolSeedAmount: "250000000000000000000000000",
    excessRecipient: "0x...",
    lpDeployer: "0x..."
  },
  compiler_version: "0.8.26",
  optimization_runs: 200,
  via_ir: true,
  verification_status: "pending"
}
```

### 批量验证流程

验证脚本会：

1. 从数据库获取所有 `verification_status = 'pending'` 或 `'failed'` 的合约
2. 读取 `constructor_args` 构造验证命令
3. 调用 Hardhat verify
4. 更新数据库中的验证状态

## 数据库字段

### deployed_tokens 新增字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `constructor_args` | JSONB | 构造函数参数（JSON 格式） |
| `compiler_version` | VARCHAR(20) | Solidity 版本（如 0.8.26） |
| `optimization_runs` | INTEGER | 优化运行次数（如 200） |
| `via_ir` | BOOLEAN | 是否使用 Via IR |
| `verification_status` | VARCHAR(20) | 验证状态：pending/verifying/verified/failed |
| `verification_guid` | VARCHAR(100) | Basescan 验证 GUID |
| `verified_at` | TIMESTAMP | 验证成功时间 |
| `verification_error` | TEXT | 验证失败错误信息 |
| `verification_retry_count` | INTEGER | 验证尝试次数 |
| `verification_last_attempt` | TIMESTAMP | 最后一次验证尝试时间 |

## 手动验证单个合约

如果需要手动验证：

```bash
cd contracts

# 获取合约信息（从数据库或日志）
# 构造函数参数：
NAME="MyToken"
SYMBOL="MTK"
MINT_AMOUNT="10000000000000000000000"
MAX_MINT_COUNT=10000
PAYMENT_TOKEN="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
PRICE_PER_MINT="1000000"
POOL_SEED_AMOUNT="250000000000000000000000000"
EXCESS_RECIPIENT="0x..."
LP_DEPLOYER="0x..."

# 验证命令
npx hardhat verify --network base 合约地址 \
  "$NAME" \
  "$SYMBOL" \
  "$MINT_AMOUNT" \
  $MAX_MINT_COUNT \
  "$PAYMENT_TOKEN" \
  "$PRICE_PER_MINT" \
  "$POOL_SEED_AMOUNT" \
  "$EXCESS_RECIPIENT" \
  "$LP_DEPLOYER"
```

## 查询验证状态

### SQL 查询

```sql
-- 查看所有合约验证状态
SELECT 
  name, 
  symbol, 
  address, 
  network,
  verification_status,
  verified_at
FROM deployed_tokens
ORDER BY created_at DESC;

-- 查看未验证的合约
SELECT 
  address, 
  name, 
  network,
  verification_status,
  verification_error
FROM deployed_tokens
WHERE verification_status IN ('pending', 'failed')
AND is_active = true;

-- 验证统计
SELECT * FROM verification_stats;
```

### API 端点（可选添加）

可以在 `index-multi-token.ts` 中添加：

```typescript
// 获取验证状态
app.get('/api/tokens/:address/verification', async (req, res) => {
  const { address } = req.params;
  const token = await getToken(pool, address);
  
  if (!token) {
    return res.status(404).json({ error: 'Token not found' });
  }
  
  res.json({
    address: token.address,
    verification_status: token.verification_status,
    verification_guid: token.verification_guid,
    verified_at: token.verified_at,
    error: token.verification_error
  });
});

// 触发单个合约验证
app.post('/api/tokens/:address/verify', async (req, res) => {
  const { address } = req.params;
  
  try {
    const result = await verifyContract(pool, address);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

## 失败处理与重试

### 自动错误处理

批量验证会自动处理失败情况：

1. **失败跳过** - 单个合约验证失败不影响其他合约
2. **数据库记录** - 失败信息自动保存到 `verification_error` 字段
3. **重试计数** - 每次尝试都会增加 `verification_retry_count`
4. **时间追踪** - 记录最后尝试时间到 `verification_last_attempt`

### 管理失败的合约

```sql
-- 查看所有失败的合约及重试次数
SELECT 
  name, 
  symbol, 
  address, 
  verification_retry_count,
  verification_last_attempt,
  verification_error
FROM deployed_tokens
WHERE verification_status = 'failed'
ORDER BY verification_retry_count DESC;

-- 重置某个合约的验证状态（手动修复后）
UPDATE deployed_tokens 
SET 
  verification_status = 'pending',
  verification_retry_count = 0,
  verification_error = NULL
WHERE address = '0x...';

-- 批量重置失败超过 5 次的合约（放弃验证）
UPDATE deployed_tokens 
SET is_active = false
WHERE verification_retry_count > 5;
```

### 重试策略

```bash
# 策略 1: 只重试失败次数少的
npm run verify -- --max-retries=3

# 策略 2: 增加延迟避免速率限制
npm run verify -- --delay=20000

# 策略 3: 单独处理失败的
npm run verify -- --address=0x123...

# 策略 4: 定时重试（使用 cron）
0 */6 * * * cd /path && npm run verify --max-retries=5
```

## 故障排除

### 调试工具

查看合约的完整错误信息和构造函数参数：

```bash
# 快速查看
npm run debug-verification 0x123...

# 或使用数据库直接查询
psql $DATABASE_URL -c "SELECT address, verification_error, constructor_args FROM deployed_tokens WHERE address='0x...';"
```

### 验证失败常见原因

1. **Etherscan API V1 已弃用（2024年12月起）**
   ```
   You are using a deprecated V1 endpoint, switch to Etherscan API V2
   ```
   
   **解决方案**：已更新 `hardhat.config.js` 使用单一 API key 格式：
   ```javascript
   etherscan: {
     apiKey: process.env.BASESCAN_API_KEY,  // 单一 key，不再是对象
     customChains: [...]
   }
   ```
   
   如果遇到此错误，确保你的配置已更新到 V2 格式。

2. **API Key 未配置**
   ```
   Error: Missing API Key
   ```
   解决：在 `contracts/.env` 中添加 `BASESCAN_API_KEY`

3. **构造函数参数不匹配**
   ```
   Error: Constructor arguments do not match
   ```
   解决：检查数据库中的 `constructor_args` 是否正确

4. **编译器配置不匹配**
   ```
   Error: Bytecode does not match
   ```
   解决：确保 `hardhat.config.js` 中的配置与数据库一致：
   - Solidity version: 0.8.26
   - Optimizer runs: 200
   - Via IR: true

5. **合约已验证**
   ```
   Already Verified
   ```
   这是正常情况，脚本会自动更新状态为 verified

6. **Rate Limiting**
   ```
   Error: Rate limit exceeded
   ```
   解决：增加 `--delay` 参数，延长请求间隔

### 检查验证状态

```bash
# 在 Basescan 上手动检查
# Base Mainnet
https://basescan.org/address/合约地址#code

# Base Sepolia
https://sepolia.basescan.org/address/合约地址#code
```

## 自动化验证

### 在部署后自动验证

可以修改 `tokenDeployer.ts` 的 `deployToken` 函数：

```typescript
// 部署后自动触发验证
const result = await deployToken(config);
await saveDeployedToken(pool, config, result);

// 异步验证（不阻塞响应）
verifyContract(pool, result.address).catch(err => {
  console.error(`Background verification failed for ${result.address}:`, err);
});
```

### Cron Job 定期验证

使用 PM2 或系统 cron：

```bash
# 每小时验证一次未验证的合约
0 * * * * cd /path/to/server && npm run verify >> logs/verify.log 2>&1
```

或添加到 PM2 ecosystem.config.cjs：

```javascript
{
  script: 'scripts/verify-contracts.ts',
  name: 'contract-verifier',
  cron_restart: '0 * * * *', // 每小时
  autorestart: false,
  watch: false
}
```

## 安全注意事项

1. **保护 API Key** - 不要提交到 Git，使用环境变量
2. **验证数据库数据** - 定期备份 `constructor_args` 数据
3. **日志记录** - 保留验证日志用于审计
4. **速率限制** - 遵守 Basescan API 速率限制

## 参考

- [Hardhat Verification Plugin](https://hardhat.org/hardhat-runner/plugins/nomicfoundation-hardhat-verify)
- [Basescan API Documentation](https://docs.basescan.org/)
- [Etherscan Verification API](https://docs.etherscan.io/tutorials/verifying-contracts-programmatically)

