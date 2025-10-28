# X402 Token Mint System

> **完整的代币发行和流动性管理系统** - 支持Uniswap V3/V4，EIP-3009无Gas Mint，自动LP部署

## 🆕 Uniswap V4 支持

**现在支持 Uniswap V4！** 如果你在 V3 遇到问题，可以切换到 V4：

```bash
# 使用 V4 LP Deployer
cd server
npm run lp-deployer:v4

# 查看 V4 文档
cat UNISWAP_V4_MIGRATION.md
```

V4 优势：
- ✅ **Hooks 系统** - 高度可定制的池子逻辑
- ✅ **Gas 优化** - 单例 PoolManager 架构
- ✅ **更灵活** - 支持自定义费用、动态费率等

## ✨ 核心特性

- ✅ **Multi-Token支持** - 一个服务器管理多个token
- ✅ **无Gas Minting** - EIP-3009 gasless transfers
- ✅ **自动LP部署** - Mint完成后自动创建Uniswap流动性池
- ✅ **V3/V4 双支持** - 根据需求选择 Uniswap 版本
- ✅ **队列系统** - 批量处理mint请求，降低Gas成本
- ✅ **完整LP管理** - 收取费用、调整流动性、移除LP

## 🎯 工作流程

```
1. 部署Token → 80%用户mint + 20% LP储备
                ↓
2. 用户Mint → 支付USDC，获得Token（队列批处理）
                ↓
3. 自动LP部署 → 达到maxMintCount后自动创建Uniswap V3池
                ↓
4. LP管理 → 收取手续费、调整流动性、移除LP
```

## 🚀 快速开始

### 1. 环境准备

```bash
# 安装依赖
cd server && npm install
cd ../contracts && npm install

# 配置环境变量
cp server/.env.example server/.env
# 填写: DATABASE_URL, SERVER_PRIVATE_KEY, EXCESS_RECIPIENT_ADDRESS
```

### 2. 启动服务器

```bash
cd server
npm run dev:multi-token
```

日志应显示：
```
🚀 Multi-Token x402 Server running on port 3002
LP Monitor: ✅ Enabled V3 (check every 15s)
```

### 3. 部署Token

```bash
curl -X POST http://localhost:3002/api/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Token",
    "symbol": "MTK",
    "mintAmount": "1000",
    "maxMintCount": 10,
    "price": "1",
    "paymentToken": "USDC",
    "deployer": "0x你的地址"
  }'
```

### 4. Mint代币

```bash
curl -X POST http://localhost:3002/api/mint/TOKEN_ADDRESS \
  -H "Content-Type: application/json" \
  -d '{
    "payer": "0x用户地址",
    "paymentTxHash": "0x支付交易hash"
  }'
```

### 5. LP自动部署

当所有mint完成后，系统会在15秒内自动部署LP。无需手动操作！

```bash
# 查看状态
curl http://localhost:3002/api/tokens/TOKEN_ADDRESS
```

## 📋 项目结构

```
token-mint/
├── contracts/
│   ├── contracts/PAYX.sol          # 主合约（Uniswap V3）
│   └── scripts/deployTokenV3.js    # 部署脚本
│
├── server/
│   ├── index-multi-token.ts        # 主服务器
│   ├── services/
│   │   ├── tokenDeployer.ts        # Token部署服务
│   │   └── lpDeployer.ts           # LP监听器（V3）
│   ├── queue/processor.ts          # Mint队列处理器
│   └── db/schema-v3.sql            # 数据库Schema
│
└── 0x402.io/
    └── components/                  # 前端组件
```

## 🔧 配置

### 网络配置

```typescript
// Base Sepolia (测试网)
Position Manager: 0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2
USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e

// Base (主网)
Position Manager: 0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1
USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

### Pool设置

- **Fee Tier**: 3000 (0.3%) - Uniswap V3标准
- **Range**: Full range (-887220 to 887220)
- **Price**: 动态计算，基于pricePerMint和mintAmount

## 📚 文档

### 🔥 快速选择
- **[V3_VS_V4_QUICK_GUIDE.md](V3_VS_V4_QUICK_GUIDE.md)** - ⚡ V3 vs V4 快速对比（先看这个！）

### Uniswap V4
- **[UNISWAP_V4_MIGRATION.md](UNISWAP_V4_MIGRATION.md)** - 🆕 V4 完整指南
- **[server/lp-deployer-v4.ts](server/lp-deployer-v4.ts)** - V4 LP Deployer 源码

### Uniswap V3
- **[README_V3.md](README_V3.md)** - 完整的V3系统文档
- **[server/lp-deployer-standalone.ts](server/lp-deployer-standalone.ts)** - V3 LP Deployer 源码

### 通用文档
- **[LP_DEPLOYER_STANDALONE.md](LP_DEPLOYER_STANDALONE.md)** - LP Deployer 架构说明
- **[TRENDING_TOKENS_SORTING.md](TRENDING_TOKENS_SORTING.md)** - 排序算法
- **[server/README.md](server/README.md)** - 服务器文档
- **[contracts/README.md](contracts/README.md)** - 合约文档

## 🛠️ LP管理

### 合约函数

```solidity
// 收取LP手续费
function collectLPFees() external returns (uint256, uint256)

// 减少流动性
function decreaseLiquidity(uint128 amount) external returns (uint256, uint256)

// 完全移除LP
function removeLPCompletely() external returns (uint256, uint256)

// 销毁LP NFT
function burnLP() external

// 查询LP信息
function getLPPositionInfo() external view returns (...)
```

### 示例：收取费用

```bash
cast send TOKEN_ADDRESS "collectLPFees()" \
  --private-key YOUR_ADMIN_KEY \
  --rpc-url https://sepolia.base.org
```

## 🧪 测试

### 完整流程测试

```bash
# 1. 部署token (maxMintCount=2 用于快速测试)
curl -X POST http://localhost:3002/api/deploy -d '{"maxMintCount": 2, ...}'

# 2. 完成2次mint
curl -X POST http://localhost:3002/api/mint/TOKEN_ADDRESS -d '{...}'
curl -X POST http://localhost:3002/api/mint/TOKEN_ADDRESS -d '{...}'

# 3. 等待15-30秒，LP自动部署
watch -n 5 "curl -s http://localhost:3002/api/tokens/TOKEN_ADDRESS | jq '.liquidityDeployed'"

# 4. 验证
cast call TOKEN_ADDRESS "liquidityDeployed()" --rpc-url https://sepolia.base.org
# 返回: true
```

## 📊 API端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/api/deploy` | POST | 部署新token |
| `/api/tokens` | GET | 列出所有tokens |
| `/api/tokens/:address` | GET | Token详情 |
| `/api/mint/:address` | POST | 添加到mint队列 |
| `/api/queue/:queueId` | GET | 查询队列状态 |

## 🔍 故障排查

### LP未自动部署？

```bash
# 1. 检查mint进度
curl http://localhost:3002/api/tokens/TOKEN | jq '{mintCount, maxMintCount}'

# 2. 查看错误（如有）
curl http://localhost:3002/api/tokens/TOKEN | jq '.lpDeploymentError'

# 3. 检查服务器日志
# 应该看到: "🎉 SYMBOL is ready for LP deployment!"
```

### 数据库迁移

```bash
# 使用V3 schema
cd server
psql $DATABASE_URL -f db/schema-v3.sql

# 或从V4迁移
psql $DATABASE_URL -f db/migrate-v4-to-v3.sql
```

## ⚠️ 重要说明

### ✅ 使用V3
- 成熟稳定的Uniswap V3生态
- 标准NFT position管理
- 完整的工具链支持
- Fee tiers: 0.05%, 0.3%, 1%

### ❌ 不支持V4
- 已移除所有V4代码
- 不支持V4 PoolManager
- 不支持Permit2
- 不支持Hooks系统

## 🎉 优势

1. **简单** - 无需复杂的V4配置
2. **稳定** - 基于成熟的V3生态
3. **自动化** - LP自动部署，无需手动干预
4. **灵活** - 完整的LP管理功能
5. **兼容** - 标准ERC20，支持所有钱包和DEX

## 🆘 支持

遇到问题？
1. 查看 [README_V3.md](README_V3.md) 获取详细信息
2. 检查服务器日志
3. 验证链上数据
4. 查看数据库状态

## 📜 License

MIT

---

**Built with ❤️ using Uniswap V3**
