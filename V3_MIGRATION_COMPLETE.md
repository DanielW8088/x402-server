# ✅ V3迁移完成

## 🎯 变更总结

已完全移除V4相关代码，系统现在**仅支持Uniswap V3**。

## 📋 完成的更改

### 1. **合约层面**
- ✅ 删除 `contracts/contracts/PAYX.sol` (V4版本)
- ✅ 重命名 `PAYX_V3.sol` → `PAYX.sol`
- ✅ 更新合约名称：`PAYX_V3` → `PAYX`
- ✅ 编译成功，无错误

### 2. **服务器层面**
- ✅ 更新 `server/index-multi-token.ts`
  - 使用 `LPDeployerMonitor` (V3版本)
  - 配置V3 Position Manager地址
  - 更新启动日志
- ✅ 更新 `server/services/tokenDeployer.ts`
  - 移除V4配置（PoolManager, Permit2）
  - 更新网络配置为V3 Position Manager
  - 更新部署脚本使用PAYX合约
  - 更新数据库保存逻辑
- ✅ 重命名 `lpDeployerV3.ts` → `lpDeployer.ts`
- ✅ 删除 `lpDeployer.ts` (V4版本)

### 3. **数据库层面**
- ✅ 创建 `server/db/schema-v3.sql` - 完整的V3 schema
- ✅ 创建 `server/db/migrate-v4-to-v3.sql` - 迁移脚本
- 保留的字段：
  - `position_manager` (V3 NonfungiblePositionManager)
  - `pool_fee` (V3 fee tier: 3000 = 0.3%)
  - `lp_token_id` (V3 NFT position ID)
  - `liquidity_tx_hash`
  - `liquidity_deployed_at`
  - `lp_deployment_error`
- 移除的字段：
  - ❌ `pool_manager` (V4)
  - ❌ `permit2` (V4)
  - ❌ `sqrt_price_payment_first` (V4)
  - ❌ `sqrt_price_token_first` (V4)
  - ❌ `pool_tick_spacing` (V4)

### 4. **部署脚本**
- ✅ 更新 `contracts/scripts/deployTokenV3.js`
  - 使用 `PAYX` 合约（不再是`PAYX_V3`）
  - V3 Position Manager地址
  - 3000 (0.3%) 默认fee tier

## 🚀 如何使用

### 启动服务器
```bash
cd server
npm run dev:multi-token
```

日志显示：
```
🚀 Multi-Token x402 Server running on port 3002
Network: base-sepolia
Database: ✅ Enabled
Queue System: ✅ Enabled (batch every 10s)
LP Monitor: ✅ Enabled V3 (check every 15s)
```

### 部署新Token
```bash
# 方式1: 通过API
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

# 方式2: 直接用Hardhat
cd contracts
export TOKEN_NAME="My Token"
export TOKEN_SYMBOL="MTK"
export MINT_AMOUNT="1000"
export MAX_MINT_COUNT="10"
export PRICE="1"
export EXCESS_RECIPIENT="0x你的地址"

npx hardhat run scripts/deployTokenV3.js --network baseSepolia
```

### 数据库迁移（如果有旧数据）
```bash
cd server
psql $DATABASE_URL -f db/migrate-v4-to-v3.sql
```

或者从零开始：
```bash
psql $DATABASE_URL -f db/schema-v3.sql
```

## 🔧 配置说明

### 网络配置
```typescript
// Base Sepolia
Position Manager: 0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2
USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e

// Base Mainnet
Position Manager: 0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1
USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

### Pool配置
- **Fee Tier**: 3000 (0.3%) - Uniswap V3标准tier
- **Tick Range**: Full range (-887220 to 887220)
- **Price**: 1:1 ratio (可根据需求调整)

## 📊 系统流程

### Token生命周期
1. **部署** → Token合约创建，80%用户mint + 20% LP reserve
2. **Minting** → 用户通过队列系统mint
3. **LP自动部署** → Mint完成后，监听器自动部署LP
4. **LP管理** → 可收取费用、调整流动性、移除LP

### LP部署流程（自动）
1. 监听器每15秒检查pending tokens
2. 当 `mintCount >= maxMintCount` 且 `liquidityDeployed = false`
3. Step 1: 创建并初始化Uniswap V3 Pool（如果需要）
4. Step 2: 调用 `token.deployLiquidityV3()`
5. 更新数据库状态

## 🛠️ LP管理函数（合约）

```solidity
// 收取LP手续费
function collectLPFees() external onlyRole(DEFAULT_ADMIN_ROLE)
    returns (uint256 amount0, uint256 amount1)

// 减少流动性（不移除position）
function decreaseLiquidity(uint128 liquidityAmount) external onlyRole(DEFAULT_ADMIN_ROLE)
    returns (uint256 amount0, uint256 amount1)

// 收取减少流动性后的代币
function collectAfterDecrease() external onlyRole(DEFAULT_ADMIN_ROLE)
    returns (uint256 amount0, uint256 amount1)

// 完全移除LP（减少100%流动性+收取）
function removeLPCompletely() external onlyRole(DEFAULT_ADMIN_ROLE)
    returns (uint256 amount0, uint256 amount1)

// Burn LP NFT（必须先完全移除流动性）
function burnLP() external onlyRole(DEFAULT_ADMIN_ROLE)

// 查询LP信息
function getLPPositionInfo() external view returns (...)
```

## ⚠️ 重要提示

### ❌ 已移除的功能
- Uniswap V4支持
- PoolManager
- Permit2集成
- Hooks系统
- V4特有的tick spacing概念

### ✅ 保留的功能
- EIP-3009 gasless minting
- x402 payment integration
- 队列系统
- 自动LP部署
- AccessControl权限管理
- LP费用收取
- LP管理功能

## 🧪 测试

### 测试LP部署
```bash
# 1. 部署token
curl -X POST http://localhost:3002/api/deploy ...

# 2. 完成所有mints
curl -X POST http://localhost:3002/api/mint/:address ...

# 3. 监听器会在15秒内自动部署LP

# 4. 检查状态
curl http://localhost:3002/api/tokens/:address
```

### 查看LP信息（链上）
```bash
# 替换为你的token地址
TOKEN=0x...

# 查看LP是否部署
cast call $TOKEN "liquidityDeployed()" --rpc-url https://sepolia.base.org

# 查看LP token ID
cast call $TOKEN "lpTokenId()" --rpc-url https://sepolia.base.org

# 查看LP详情
cast call $TOKEN "getLPPositionInfo()" --rpc-url https://sepolia.base.org
```

## 🎉 完成！

系统现在完全基于**Uniswap V3**，更简单、更稳定：
- ✅ 无需Permit2
- ✅ 无需PoolManager
- ✅ 无需Hooks
- ✅ 标准的NFT position管理
- ✅ 成熟的V3生态

如有问题，查看日志或联系支持！

