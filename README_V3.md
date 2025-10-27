# X402 Token Mint - Uniswap V3 Edition

> **✅ 纯V3系统** - 移除所有V4依赖，更简单稳定

## 🚀 快速开始

### 1. 环境准备
```bash
# 安装依赖
cd server && npm install
cd ../contracts && npm install

# 配置环境变量
cp server/.env.example server/.env
# 填写：
# - DATABASE_URL
# - SERVER_PRIVATE_KEY
# - EXCESS_RECIPIENT_ADDRESS (可选)
```

### 2. 启动服务器
```bash
cd server
npm run dev:multi-token
```

日志确认：
```
🚀 Multi-Token x402 Server running on port 3002
Network: base-sepolia
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

### 4. 自动LP部署
- Mints完成后，LP监听器**自动部署**
- 无需手动操作
- 检查进度：`curl http://localhost:3002/api/tokens/:address`

## 📋 系统架构

### 合约（V3）
- `contracts/contracts/PAYX.sol` - 主合约
- Uniswap V3 NonfungiblePositionManager
- 标准ERC20 + EIP-3009
- 自动LP部署功能

### 后端服务
- `server/index-multi-token.ts` - 主服务器
- `server/services/tokenDeployer.ts` - Token部署
- `server/services/lpDeployer.ts` - LP监听器（V3）
- `server/queue/processor.ts` - Mint队列

### 数据库
- `server/db/schema-v3.sql` - V3 schema（推荐）
- `server/db/migrate-v4-to-v3.sql` - 从V4迁移

## 🔧 配置

### 网络地址
```typescript
// Base Sepolia
Position Manager: 0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2
USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e

// Base Mainnet  
Position Manager: 0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1
USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

### Pool设置
- Fee: **3000 (0.3%)** - V3标准tier
- Range: **Full range** (-887220 to 887220)
- Price: 1:1 ratio (USDC:Token)

## 🛠️ LP管理

### 合约函数
```solidity
// 收取手续费
token.collectLPFees()

// 减少流动性
token.decreaseLiquidity(amount)

// 完全移除LP
token.removeLPCompletely()

// 销毁LP NFT
token.burnLP()

// 查询LP信息
token.getLPPositionInfo()
```

### 示例：收取LP费用
```bash
TOKEN=0x你的token地址
ADMIN=0x管理员私钥

cast send $TOKEN "collectLPFees()" \
  --private-key $ADMIN \
  --rpc-url https://sepolia.base.org
```

## 📊 API端点

### Token管理
- `POST /api/deploy` - 部署新token
- `GET /api/tokens` - 列出所有tokens
- `GET /api/tokens/:address` - Token详情

### Minting
- `POST /api/mint/:address` - 添加到mint队列
- `GET /api/queue/:queueId` - 队列状态

### 响应示例
```json
{
  "address": "0x...",
  "name": "My Token",
  "symbol": "MTK",
  "mintCount": 10,
  "maxMintCount": 10,
  "liquidityDeployed": true,
  "lpTokenId": "123456",
  "liquidityTxHash": "0x..."
}
```

## ⚡ 工作流程

### Token生命周期
```
1. 部署 → Token创建 (80% user mint + 20% LP reserve)
         ↓
2. Minting → 用户通过队列mint
         ↓
3. LP自动部署 → mintCount = maxMintCount 触发
         ↓
4. LP管理 → 收费、调整、移除
```

### LP自动部署流程
```
每15秒:
  监听器检查 → mintCount >= maxMintCount?
               ↓ YES
         创建V3 Pool (如需要)
               ↓
         调用 token.deployLiquidityV3()
               ↓
         更新数据库
               ↓
         ✅ 完成
```

## 🧪 测试

### 完整流程测试
```bash
# 1. 部署token
DEPLOY_RESULT=$(curl -X POST http://localhost:3002/api/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Token",
    "symbol": "TST",
    "mintAmount": "1000",
    "maxMintCount": 2,
    "price": "1",
    "paymentToken": "USDC",
    "deployer": "0x你的地址"
  }')

TOKEN=$(echo $DEPLOY_RESULT | jq -r '.address')
echo "Token deployed: $TOKEN"

# 2. Mint (需要2次)
curl -X POST http://localhost:3002/api/mint/$TOKEN \
  -H "Content-Type: application/json" \
  -d '{"payer": "0x用户地址", "paymentTxHash": "0x..."}'

# 3. 等待自动LP部署 (15-30秒)
watch -n 5 "curl -s http://localhost:3002/api/tokens/$TOKEN | jq '.liquidityDeployed'"

# 4. 验证LP
cast call $TOKEN "liquidityDeployed()" --rpc-url https://sepolia.base.org
# 应该返回: true

cast call $TOKEN "lpTokenId()" --rpc-url https://sepolia.base.org
# 应该返回: <NFT_ID>
```

### 链上验证
```bash
TOKEN=0x你的token地址

# LP状态
cast call $TOKEN "liquidityDeployed()" --rpc-url https://sepolia.base.org

# Mint进度
cast call $TOKEN "mintCount()" --rpc-url https://sepolia.base.org
cast call $TOKEN "maxMintCount()" --rpc-url https://sepolia.base.org

# LP Position Info
cast call $TOKEN "getLPPositionInfo()" --rpc-url https://sepolia.base.org
```

## 🔍 故障排查

### LP未自动部署
```bash
# 1. 检查mint是否完成
curl http://localhost:3002/api/tokens/$TOKEN | jq '{mintCount, maxMintCount}'

# 2. 查看LP错误（如有）
curl http://localhost:3002/api/tokens/$TOKEN | jq '.lpDeploymentError'

# 3. 检查服务器日志
# 应该看到：
# "🎉 TOKEN_SYMBOL is ready for LP deployment!"

# 4. 手动触发（如需）
# 见 QUICK_V3_SETUP.md
```

### 数据库问题
```bash
# 如果从V4迁移
cd server
psql $DATABASE_URL -f db/migrate-v4-to-v3.sql

# 或从零开始
psql $DATABASE_URL -f db/schema-v3.sql
```

### 合约问题
```bash
# 重新编译
cd contracts
npx hardhat clean
npx hardhat compile
```

## 📚 文档

- [V3_MIGRATION_COMPLETE.md](V3_MIGRATION_COMPLETE.md) - 迁移完成总结
- [LP_MANAGEMENT_GUIDE.md](LP_MANAGEMENT_GUIDE.md) - LP管理指南
- [QUICK_V3_SETUP.md](QUICK_V3_SETUP.md) - 快速设置
- [MIGRATION_TO_V3.md](MIGRATION_TO_V3.md) - 迁移参考

## ⚠️ 重要说明

### ✅ V3特性
- 成熟稳定的V3生态
- NFT position管理
- 标准的手续费层级 (0.05%, 0.3%, 1%)
- 完整的工具链支持

### ❌ 已移除V4
- 不支持V4 PoolManager
- 不支持Permit2
- 不支持Hooks
- 不支持自定义tick spacing

### 💡 提示
- Pool fee默认3000 (0.3%)，最常用
- LP部署使用full range，流动性覆盖所有价格
- LP NFT可转移，管理员可转让ownership

## 🎉 优势

1. **简单** - 无需复杂的V4配置
2. **稳定** - 基于成熟的V3生态
3. **自动化** - LP自动部署，无需手动干预
4. **灵活** - 完整的LP管理功能
5. **兼容** - 标准ERC20，支持所有钱包和DEX

## 🆘 支持

遇到问题？
1. 查看服务器日志
2. 检查数据库状态
3. 验证链上数据
4. 参考文档

---

**Happy Building! 🚀**

