# LP管理指南

## 📖 概述

LP（流动性提供）部署后，存储为Uniswap V3 NFT position。本指南介绍如何管理这些LP position。

## 🎯 LP管理功能

### 1. 查看LP信息
```javascript
function getLPPositionInfo() 
  returns (
    uint96 nonce,
    address operator,
    address token0,
    address token1,
    uint24 fee,
    int24 tickLower,
    int24 tickUpper,
    uint128 liquidity,      // 当前流动性数量
    uint256 feeGrowthInside0LastX128,
    uint256 feeGrowthInside1LastX128,
    uint128 tokensOwed0,    // 待领取的token0
    uint128 tokensOwed1     // 待领取的token1
  )
```

### 2. 收集手续费
仅收集累积的交易手续费，不影响流动性：

```javascript
function collectLPFees() 
  returns (uint256 amount0, uint256 amount1)
```

### 3. 减少流动性
部分或全部移除流动性（token还在position中，需要collect）：

```javascript
function decreaseLiquidity(
  uint128 liquidity,   // 要移除的流动性数量
  uint256 amount0Min,  // 最小收到的token0（滑点保护）
  uint256 amount1Min   // 最小收到的token1（滑点保护）
) returns (uint256 amount0, uint256 amount1)
```

### 4. 收集减少的token
在减少流动性后，收集token到钱包：

```javascript
function collectAfterDecrease() 
  returns (uint256 amount0, uint256 amount1)
```

### 5. 完全移除LP（推荐）
一次性完成减少流动性+收集token：

```javascript
function removeLPCompletely(uint128 currentLiquidity) 
  returns (uint256 amount0, uint256 amount1)
```

### 6. 销毁NFT
流动性为零后，可选择销毁NFT：

```javascript
function burnLP()
```

## 🔄 LP取出流程

### 方案A：完全移除（推荐）

**适用场景：** 一次性取出所有LP

```bash
# Step 1: 查询当前流动性
cast call $TOKEN_ADDRESS "getLPPositionInfo()" --rpc-url $RPC_URL

# Step 2: 记录liquidity值（第8个返回值）
# 假设liquidity = 1000000000000000000

# Step 3: 完全移除LP
cast send $TOKEN_ADDRESS \
  "removeLPCompletely(uint128)" \
  1000000000000000000 \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY

# Step 4: (可选) 销毁NFT
cast send $TOKEN_ADDRESS "burnLP()" \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY
```

### 方案B：分步操作

**适用场景：** 需要细粒度控制

```bash
# Step 1: 查询信息
cast call $TOKEN_ADDRESS "getLPPositionInfo()" --rpc-url $RPC_URL

# Step 2: 减少流动性
cast send $TOKEN_ADDRESS \
  "decreaseLiquidity(uint128,uint256,uint256)" \
  1000000000000000000 0 0 \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY

# Step 3: 收集token
cast send $TOKEN_ADDRESS "collectAfterDecrease()" \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY

# Step 4: (可选) 销毁NFT
cast send $TOKEN_ADDRESS "burnLP()" \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY
```

### 方案C：只收集手续费

**适用场景：** 保留LP，只收益

```bash
cast send $TOKEN_ADDRESS "collectLPFees()" \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY
```

## 📝 使用脚本

### 查询LP信息

```bash
cd contracts
TOKEN_ADDRESS=0x... \
npx hardhat run scripts/getLPInfo.js --network baseSepolia
```

### 完全移除LP

```bash
cd contracts
TOKEN_ADDRESS=0x... \
npx hardhat run scripts/removeLPCompletely.js --network baseSepolia
```

### 只收集手续费

```bash
cd contracts
TOKEN_ADDRESS=0x... \
npx hardhat run scripts/collectLPFees.js --network baseSepolia
```

## ⚠️ 重要提示

### 1. 权限要求
所有LP管理函数需要`DEFAULT_ADMIN_ROLE`权限。默认情况下，token部署者拥有此权限。

### 2. 滑点保护
- `amount0Min` 和 `amount1Min` 是滑点保护参数
- 设为0表示接受任何数量（有风险）
- 建议设置为预期值的95-99%

### 3. 流动性计算
- 流动性是一个抽象值，不等于token数量
- 使用 `getLPPositionInfo()` 查看当前流动性
- 移除时必须提供准确的流动性值

### 4. NFT状态
- LP position以NFT形式存在
- 即使流动性为零，NFT仍然存在
- 可选择burn NFT来完全清理

### 5. Gas费用
- 移除LP需要较高gas（~200k-300k）
- 在gas低时操作更经济

## 🎯 典型场景

### 场景1：项目结束，取出所有LP

```javascript
// 1. 获取流动性
const info = await contract.getLPPositionInfo();
const liquidity = info.liquidity;

// 2. 完全移除
await contract.removeLPCompletely(liquidity);

// 3. 销毁NFT
await contract.burnLP();
```

### 场景2：定期收集手续费

```javascript
// 每周/每月运行
await contract.collectLPFees();
```

### 场景3：部分减少流动性

```javascript
// 移除50%流动性
const info = await contract.getLPPositionInfo();
const halfLiquidity = info.liquidity / 2n;

await contract.decreaseLiquidity(halfLiquidity, 0, 0);
await contract.collectAfterDecrease();
```

## 🔍 查看LP价值

在区块链浏览器上：

1. 进入token合约地址
2. 查看合约变量 `_lpTokenId`
3. 访问Uniswap V3 Position Manager查看该NFT
   - Base Sepolia: `0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2`
   - Base Mainnet: `0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1`

或使用Uniswap界面：
- https://app.uniswap.org/pools

## 📊 计算LP价值

LP价值 = (token0数量 * token0价格) + (token1数量 * token1价格)

可以使用 `getLPPositionInfo()` 查看：
- `tokensOwed0/1`: 待领取的token
- `liquidity`: 当前流动性（需要通过Uniswap库计算对应的token数量）

## 🛠️ 故障排除

### 问题1: "Liquidity not deployed"
**原因：** LP还未部署
**解决：** 等待mint完成并自动部署LP

### 问题2: "No LP position"
**原因：** `_lpTokenId` 为0
**解决：** 检查LP是否真的部署了

### 问题3: "Price slippage check"
**原因：** 收到的token少于`amount0Min/amount1Min`
**解决：** 降低滑点保护参数或在价格稳定时操作

### 问题4: "Not cleared"
**原因：** 尝试burn有流动性的NFT
**解决：** 先完全移除流动性

## 📚 相关资源

- [Uniswap V3 Docs](https://docs.uniswap.org/contracts/v3/guides/providing-liquidity/decrease-liquidity)
- [Position NFT](https://docs.uniswap.org/contracts/v3/reference/periphery/NonfungiblePositionManager)
- [Base Explorer](https://basescan.org/)

## 💡 最佳实践

1. **定期收集手续费** - 避免手续费累积过多
2. **监控LP价值** - 关注无常损失
3. **gas优化** - 在gas低时批量操作
4. **安全第一** - 使用多签钱包管理admin权限
5. **测试先行** - 在testnet上先测试流程

