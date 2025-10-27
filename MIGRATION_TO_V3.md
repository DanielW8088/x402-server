# 迁移到Uniswap V3

> **✅ 迁移已完成！** 
> 系统现在只使用Uniswap V3。本文档保留作为参考。
> 查看 [V3_MIGRATION_COMPLETE.md](V3_MIGRATION_COMPLETE.md) 获取最新状态。

## 为什么选择V3？

✅ **更成熟稳定** - V3已经在多个链上稳定运行多年  
✅ **文档完善** - 大量教程和示例代码  
✅ **更简单** - 不需要处理V4的hooks系统  
✅ **完整支持** - Base/Base Sepolia有官方部署  

## 主要变化

### 1. 合约修改

**使用 `PAYX_V3.sol` 替代 `PAYX.sol`**

主要区别：
- ✅ 使用NonfungiblePositionManager (V3)
- ✅ 不需要PoolManager
- ✅ 不需要Permit2
- ✅ 更简单的LP部署流程
- ✅ 移除hooks相关代码

### 2. 网络配置

#### Base Sepolia (测试网)
```typescript
{
  positionManager: '0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2',
  usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
}
```

#### Base Mainnet
```typescript
{
  positionManager: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
  usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
}
```

### 3. LP部署流程

**V4 (旧方式):**
```
1. 设置lpGuardHook
2. 批准Permit2
3. Permit2批准PositionManager
4. 调用PoolManager.initialize
5. 调用PositionManager.modifyLiquidities
```

**V3 (新方式):**
```
1. 批准PositionManager (直接)
2. 调用createAndInitializePoolIfNecessary (如需要)
3. 调用mint (创建LP position)
```

## 迁移步骤

### Step 1: 编译V3合约

```bash
cd contracts
npx hardhat compile
```

### Step 2: 更新部署配置

在 `server/services/tokenDeployer.ts` 中：

```typescript
const NETWORK_CONFIG = {
  'base-sepolia': {
    positionManager: '0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
  },
  'base': {
    positionManager: '0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1',
    usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
};
```

### Step 3: 更新部署脚本

使用V3合约：

```javascript
const PAYX = await hre.ethers.getContractFactory("PAYX");
const token = await PAYX.deploy(
    TOKEN_NAME,
    TOKEN_SYMBOL,
    MINT_AMOUNT,
    MAX_MINT_COUNT,
    POSITION_MANAGER,  // V3 NonfungiblePositionManager
    PAYMENT_TOKEN,
    PRICE_PER_MINT,
    POOL_SEED_AMOUNT,
    EXCESS_RECIPIENT,
    POOL_FEE  // 500, 3000, 或 10000
);
```

### Step 4: 使用V3 LP部署器

在 `server/index-multi-token.ts` 中：

```typescript
import { LPDeployerMonitorV3 } from "./services/lpDeployerV3";

const lpDeployer = new LPDeployerMonitorV3(
  pool,
  walletClient,
  publicClient,
  '0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2' // Position Manager address
);
```

## Fee Tiers

V3有3个fee tier选项：

- **500 (0.05%)** - 适合稳定币对
- **3000 (0.3%)** - 最常用，适合大多数token
- **10000 (1%)** - 适合高波动性token

对应的tickSpacing：
- 500 → tickSpacing 10
- 3000 → tickSpacing 60  
- 10000 → tickSpacing 200

## Full Range Position

V3使用tick ranges定义流动性区间。对于full range：

```javascript
// Fee 500 (0.05%)
tickLower: -887220
tickUpper: 887220

// Fee 3000 (0.3%)  
tickLower: -887220
tickUpper: 887220

// Fee 10000 (1%)
tickLower: -887220
tickUpper: 887220
```

## sqrtPriceX96 计算

与V4相同，保持不变：

```typescript
// 对于 1 USDC = 1000 tokens 的价格
const pricePerToken = 1 / 1000; // 0.001 USDC per token

// USDC是token0: sqrt(1e18 / 1e3) * 2^96
const sqrtPriceX96 = '2505414483750479185640894519903780864';
```

## 测试

### 1. 部署测试token

```bash
cd server
npm run dev:multi-token
```

通过API部署：
```bash
curl -X POST http://localhost:4021/api/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test V3 Token",
    "symbol": "TV3",
    "mintAmount": "1000",
    "maxMintCount": 10,
    "price": "1",
    "paymentToken": "USDC",
    "deployer": "0x..."
  }'
```

### 2. 完成mint并验证LP

观察日志，应该看到：
```
🎉 TV3 is ready for LP deployment!
💧 Deploying LP for TV3...
   📍 Step 1: Creating/initializing pool if needed...
   ✅ Pool ready
   📍 Step 2: Deploying liquidity...
   ✅ LP deployed successfully!
```

### 3. 验证池子余额

```bash
cd contracts
TOKEN_ADDRESS=0x... npx hardhat run scripts/checkPoolBalanceV3.js --network baseSepolia
```

## 优势对比

| 特性 | V4 | V3 |
|------|----|----|
| 成熟度 | 🆕 新 | ✅ 成熟 |
| 文档 | ⚠️ 少 | ✅ 完善 |
| 复杂度 | 🔴 高 (hooks) | 🟢 中等 |
| Gas成本 | 🟡 较高 | 🟢 中等 |
| 部署难度 | 🔴 困难 | 🟢 简单 |
| 调试难度 | 🔴 困难 | 🟢 容易 |

## 常见问题

### Q: V3和V4的LP NFT通用吗？
A: 不通用。它们是完全不同的合约系统。

### Q: 如何选择fee tier？
A: 
- 稳定币 → 500 (0.05%)
- 普通token → 3000 (0.3%)  
- 高波动 → 10000 (1%)

### Q: V3需要hooks吗？
A: 不需要！V3没有hooks概念。

### Q: 迁移后旧token怎么办？
A: 旧token(V4)保持不变，新token使用V3部署。

## 参考资料

- [Uniswap V3 Docs](https://docs.uniswap.org/contracts/v3/overview)
- [V3 SDK](https://docs.uniswap.org/sdk/v3/overview)
- [Base Network](https://docs.base.org/)

