# LP Deployment - Quick Start Guide

快速部署指南（5分钟完成）。

## 前提条件

- ✅ Token 已完成铸造 (`mintCount >= maxMintCount`)
- ✅ 有 LP_DEPLOYER 账户的私钥
- ✅ LaunchTool 已部署（共享合约）

## 一键部署

### 1. 配置环境变量

```bash
# 必填
export TOKEN_ADDRESS=0x...              # 你的 X402Token 地址
export LAUNCH_TOOL_ADDRESS=0x...        # LaunchTool 地址
export TARGET_PRICE_USDC=0.5            # 初始价格（1 token = 0.5 USDC）
export DEPLOYER_PRIVATE_KEY=0x...       # LP_DEPLOYER 私钥

# 可选
export FEE_TIER=10000                   # 1% 手续费
export TICK_RANGE_WIDTH=100             # tick 区间宽度
```

### 2. 执行部署

```bash
npx hardhat run scripts/deployFullLiquidityFlow.js --network base
```

### 3. 完成！

脚本会自动执行所有步骤：
- ✅ 转移资产到 LP_DEPLOYER
- ✅ 授权 tokens
- ✅ 创建 Uniswap V3 池子
- ✅ 添加流动性
- ✅ 确认 LP 上线
- ✅ 清理剩余资产

## 检查状态

随时查看 token 和 LP 状态：

```bash
TOKEN_ADDRESS=0x... npx hardhat run scripts/checkTokenLpStatus.js --network base
```

输出示例：
```
📋 BASIC INFO
  Name: My Token
  Symbol: MTK
  Decimals: 18
  Total Supply: 1000000

🪙 MINTING STATUS
  Minting Completed: ✅ YES
  Mint Count: 100 / 100
  Progress: 100%

🏊 LP CONFIGURATION
  Assets Transferred: ✅ YES
  LP Live: ✅ YES

🔍 POOL STATUS
  Pool found at fee tier 1%:
  Address: 0x...
  Current Price: 1 MTK = 0.500000 USDC
  Liquidity: 1234567890

📊 DEPLOYMENT STATUS
  ✅ Minting Completed
  ✅ Assets Transferred
  ✅ Pool Created
  ✅ LP Live

🎉 LP DEPLOYMENT COMPLETE!
```

## 首次部署：先部署 LaunchTool

LaunchTool 是共享的工具合约，只需部署一次：

```bash
# 部署 LaunchTool（只做一次）
# DEPLOYER_PRIVATE_KEY 对应的地址会自动成为 admin
npx hardhat run scripts/deployLaunchTool.js --network base

# 保存输出的地址
export LAUNCH_TOOL_ADDRESS=0x...
```

详细说明见: [LAUNCHTOOL_DEPLOYMENT.md](./LAUNCHTOOL_DEPLOYMENT.md)

## 部署多个 Token LP

LaunchTool 部署后，可以为多个 token 部署 LP：

```bash
# Token A
TOKEN_ADDRESS=0xAAA... \
LAUNCH_TOOL_ADDRESS=0x... \
TARGET_PRICE_USDC=0.5 \
npx hardhat run scripts/deployFullLiquidityFlow.js --network base

# Token B
TOKEN_ADDRESS=0xBBB... \
LAUNCH_TOOL_ADDRESS=0x... \
TARGET_PRICE_USDC=1.0 \
npx hardhat run scripts/deployFullLiquidityFlow.js --network base

# Token C
TOKEN_ADDRESS=0xCCC... \
LAUNCH_TOOL_ADDRESS=0x... \
TARGET_PRICE_USDC=0.1 \
npx hardhat run scripts/deployFullLiquidityFlow.js --network base
```

## 常见问题

### ❌ "Max mint count not reached yet"
等待铸造完成，或继续铸造到上限。

### ❌ "Assets already transferred"
正常，说明资产已转移。脚本会跳过这步继续执行。

### ❌ "Pool already exists"
池子已创建。使用 checkTokenLpStatus.js 查看状态。

### ❌ "Insufficient token balance"
检查是否已调用 `transferAssetsForLP()`（脚本会自动调用）。

## 网络配置

### Base Mainnet
```bash
--network base
```

### Base Sepolia (测试)
```bash
--network baseSepolia
```

## 重要提示

1. **测试先行**: 先在 Sepolia 测试，再上主网
2. **检查地址**: 确认所有合约地址正确
3. **私钥安全**: 不要提交 `.env` 到 git
4. **足够 gas**: 确保账户有足够 ETH 支付 gas

## 价格配置说明

`TARGET_PRICE_USDC` = 1 token 价值多少 USDC

示例:
- `0.5` → 1 token = 0.5 USDC （2 tokens = 1 USDC）
- `1.0` → 1 token = 1 USDC
- `0.001` → 1 token = 0.001 USDC （1000 tokens = 1 USDC）

## 手续费配置

`FEE_TIER`:
- `500` → 0.05% (稳定币对)
- `3000` → 0.3% (推荐，大多数交易对)
- `10000` → 1% (高风险/低流动性)

## 获取帮助

详细文档见: [LP_DEPLOYMENT_GUIDE.md](./LP_DEPLOYMENT_GUIDE.md)

## 成功示例

```bash
$ TOKEN_ADDRESS=0x123... \
  LAUNCH_TOOL_ADDRESS=0x456... \
  TARGET_PRICE_USDC=0.5 \
  npx hardhat run scripts/deployFullLiquidityFlow.js --network base

╔════════════════════════════════════════════════════════════╗
║       Complete LP Deployment Flow for X402Token           ║
╚════════════════════════════════════════════════════════════╝

📋 Step A: Pre-deployment Checks
  Minting Completed: true
  Assets Transferred: false

💸 Step A3: Transfer Assets for LP
  ✅ Assets transferred in block 12345678

🔧 Step B: Prepare LP Deployer Account
  ✅ Token approved
  ✅ USDC approved

🧮 Step B3-6: Calculate Pool Parameters
  Target: 1 Token = 0.5 USDC

🏊 Step C: Create Pool and Add Liquidity
  ✅ Pool configured in block 12345679
  Position ID: 123456
  Pool Address: 0x789...

✅ Step D: Confirm LP Live
  ✅ LP marked as live in block 12345680

🔍 Step E: Verification
  Pool Address: 0x789...
  Current Price: 1 MTK = 0.500000 USDC
  LP Live Status: true

╔════════════════════════════════════════════════════════════╗
║                    ✅ DEPLOYMENT COMPLETE!                  ║
╚════════════════════════════════════════════════════════════╝

🎉 Pool Address: 0x789...
🎉 Position ID: 123456
```

## License

MIT

