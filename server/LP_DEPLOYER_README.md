# LP Deployer - 使用指南

自动监控数据库，为完成 minting 的 token 部署 Uniswap V3 流动性池。

**✅ 支持网络:**
- Base Sepolia (测试网)
- Base Mainnet (主网)

## 快速开始

### 1. 部署 LaunchTool 合约

**测试网 (Base Sepolia):**
```bash
cd ../contracts
npx hardhat run scripts/deployLaunchTool.js --network baseSepolia
# 例如: 0x91cAfe77F5266FEa14f6db43Bb73BeF6ba80c609
```

**主网 (Base Mainnet):**
```bash
cd ../contracts
npx hardhat run scripts/deployLaunchTool.js --network base
# 保存输出的地址！
```

### 2. 配置环境变量

```bash
cd ../server
cp env.multi-token.example .env
nano .env
```

**必填配置:**

```bash
# 网络选择
NETWORK=base-sepolia    # 测试网
# NETWORK=base          # 主网（生产环境）

# Token owner 私钥（必须是 token owner 且有足够 USDC）
LP_DEPLOYER_PRIVATE_KEY=0xYourTokenOwnerPrivateKey

# LaunchTool 地址（步骤1获得）
LAUNCH_TOOL_ADDRESS=0x91cAfe77F5266FEa14f6db43Bb73BeF6ba80c609

# 数据库
DATABASE_URL=postgresql://postgres:password@localhost:5432/token_mint
```

**网络详情:**

| 网络 | NETWORK 值 | Factory 地址 | USDC 地址 |
|------|-----------|-------------|-----------|
| Base Sepolia | `base-sepolia` | 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24 | 0x036CbD53842c5426634e7929541eC2318f3dCF7e |
| Base Mainnet | `base` | 0x33128a8fC17869897dcE68Ed026d694621f6FDfD | 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 |

**钱包要求:**
- 必须是 token 的 owner（用于 setLaunchTool, transferAssetsForLP, confirmLpLive）
- 必须有足够 USDC（用于提供流动性）
  - 计算: `需要 USDC = Token总量 / MINT_AMOUNT`
  - 例如: 25,000 tokens / 10,000 MINT_AMOUNT = 2.5 USDC

### 3. 获取 USDC

**测试网 (Base Sepolia):**
- 访问 https://faucet.circle.com/
- 选择 "Base Sepolia"
- 输入你的钱包地址（LP_DEPLOYER_PRIVATE_KEY 对应的地址）
- 获得 10 USDC（免费）

**主网 (Base Mainnet):**
- 需要真实 USDC
- 可以从交易所提现到 Base 主网
- 或使用 Bridge 跨链转入
- ⚠️ 确保地址正确，主网资金真实

### 4. 启动服务

**开发模式:**
```bash
npm run dev:lp-deployer
```

**生产模式 (PM2):**
```bash
pm2 start ecosystem.lp-deployer.cjs
pm2 logs lp-deployer
pm2 status
```

## 工作流程

服务每 60 秒（1分钟）检查一次数据库，自动执行:

1. **查询待部署 token**: `liquidity_deployed = false AND is_active = true`
2. **检查 token 状态**: `mintingCompleted = true AND lpLive = false`
3. **setLaunchTool**: 自动配置白名单（如需要）
4. **transferAssetsForLP**: 转移资产到部署者（如需要）
5. **Approve tokens**: 授权 Token 和 USDC 给 LaunchTool
6. **计算参数**: 价格 = 1 USDC / MINT_AMOUNT tokens
7. **部署 LP**: 调用 `LaunchTool.configurePoolByAmount()`
8. **confirmLpLive**: 标记 LP 上线
9. **更新数据库**: 设置 `liquidity_deployed = true`

## 定价逻辑

```
1 USDC = MINT_AMOUNT tokens
1 token = (1 / MINT_AMOUNT) USDC

示例:
- MINT_AMOUNT = 10,000 tokens
- Token 总量 = 25,000
- 需要 USDC = 25,000 × (1/10,000) = 2.5 USDC
```

## 监控

**查看日志:**
```bash
pm2 logs lp-deployer --lines 100
```

**查询数据库:**
```sql
-- 待部署的 token
SELECT address, symbol, name, liquidity_deployed
FROM deployed_tokens
WHERE liquidity_deployed = false AND is_active = true;

-- 失败记录
SELECT address, symbol, lp_deployment_error, lp_retry_count
FROM deployed_tokens
WHERE lp_deployment_error IS NOT NULL;

-- 清除错误状态（允许重试）
UPDATE deployed_tokens
SET lp_deployment_error = NULL, lp_retry_count = 0
WHERE address = '0xYourTokenAddress';
```

## 故障排查

### "Insufficient USDC"
```bash
# 原因: 钱包 USDC 不足
# 解决: 从 faucet 获取更多 USDC 或转入钱包
# 状态: 记录错误，自动重试
```

### "Wallet is not the token owner"
```bash
# 原因: LP_DEPLOYER_PRIVATE_KEY 不是 token owner
# 解决: 使用正确的 token owner 私钥
# 状态: 记录错误，自动重试
```

### "Insufficient token balance"
```bash
# 原因: transferAssetsForLP 未执行或失败
# 解决: 检查 token 的 assetsTransferred 状态
# 状态: 记录错误，自动重试
```

### "Minting not completed yet"
```bash
# 原因: Token 的 minting 还未完成
# 行为: 不记录错误，等待 1 分钟后继续检查
# 无需干预: 系统会自动监控直到 minting 完成
```

### "LP already live"
```bash
# 原因: LP 已经部署完成
# 行为: 跳过该 token，不记录错误
# 无需干预: Token 已成功部署
```

### 服务启动失败
```bash
# 检查环境变量
cat .env | grep -E "LP_DEPLOYER_PRIVATE_KEY|LAUNCH_TOOL_ADDRESS|DATABASE_URL"

# 测试数据库
psql $DATABASE_URL -c "SELECT 1;"

# 测试 RPC
curl -X POST https://sepolia.base.org \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'
```

### 部署卡住
```bash
# 查看交易状态
# https://sepolia.basescan.org/address/0xYourAddress

# 重启服务
pm2 restart lp-deployer
```

## 重试机制

**状态检查 vs 部署失败:**

- **状态检查未通过** (不计入失败):
  - `Minting not completed yet` - minting 未完成，继续等待
  - `LP already live` - LP 已部署，跳过
  - 不记录错误，下次轮询（1分钟）继续检查

- **部署失败** (计入重试):
  - 交易失败、余额不足、权限错误等
  - 记录错误到数据库
  - 等待 5 分钟后自动重试
  - 最多重试 5 次
  - 达到上限后需要手动清除错误

## PM2 配置

```bash
# 开机自启动
pm2 startup
pm2 save

# 日志轮转
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

## Base 主网部署

**⚠️ 主网部署前检查清单:**

- [ ] LaunchTool 已部署到 Base 主网
- [ ] LP_DEPLOYER_PRIVATE_KEY 是 token owner
- [ ] 钱包有足够的真实 USDC（根据 MINT_AMOUNT 计算）
- [ ] 钱包有足够的 ETH 支付 gas（建议至少 0.01 ETH）
- [ ] 测试网已成功部署过 LP（验证流程）
- [ ] 数据库连接到生产环境
- [ ] PM2 配置正确

**主网专用配置:**
```bash
# 必须设置为 base
NETWORK=base

# 主网 RPC（可选，默认公共 RPC）
BASE_RPC_URL=https://mainnet.base.org

# LaunchTool 主网地址
LAUNCH_TOOL_ADDRESS=0xYourMainnetLaunchToolAddress

# 生产数据库
DATABASE_URL=postgresql://...
```

**主网 Uniswap Factory:**
- 地址: `0x33128a8fC17869897dcE68Ed026d694621f6FDfD`
- 自动检测，无需配置

**主网 USDC:**
- 地址: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
- 自动检测，无需配置

## 配置说明

**可选 RPC 配置:**
```bash
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASE_RPC_URL=https://mainnet.base.org
```

**网络切换:**
```bash
# 测试网
NETWORK=base-sepolia

# 主网（确认所有配置正确后再切换！）
NETWORK=base
```

## 核心特性

- ✅ 自动监控（1分钟轮询）
- ✅ 自动白名单（setLaunchTool）
- ✅ 正确定价（1 USDC = MINT_AMOUNT tokens）
- ✅ 错误重试（最多5次）
- ✅ 状态跟踪（数据库记录）

## 技术细节

**Token 精度:** 6 decimals（与 USDC 一致）
**Fee Tier:** 1% (10000)
**Tick Range:** ±20000（自动计算）
**SafeERC20:** LaunchTool 使用 SafeERC20 保证安全

## 区块浏览器

**Base Sepolia (测试网):**
- BaseScan: https://sepolia.basescan.org/
- 查看交易: `https://sepolia.basescan.org/tx/0xYourTxHash`
- 查看地址: `https://sepolia.basescan.org/address/0xYourAddress`

**Base Mainnet (主网):**
- BaseScan: https://basescan.org/
- 查看交易: `https://basescan.org/tx/0xYourTxHash`
- 查看地址: `https://basescan.org/address/0xYourAddress`

---

**版本:** 2.1.0  
**最后更新:** 2025-10-29  
**支持网络:** Base Sepolia (测试网) | Base Mainnet (主网)

