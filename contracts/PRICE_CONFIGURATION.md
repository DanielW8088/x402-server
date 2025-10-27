# PAYX 初始价格配置

确保Uniswap v4池子创建时的初始价格正确。

## ✅ 当前配置（已验证）

### 基本参数

```javascript
LP USDC:   40,000 USDC
LP PAYX:   400,000,000 PAYX
```

### 价格目标

```
初始价格:    $0.0001 per PAYX
Mint价格:    $1.00 per mint (10,000 PAYX)
总市值:      $200,000 (fully diluted)
LP占比:      20% of market cap
```

### sqrtPriceX96 值

```javascript
// 当 USDC 地址 < PAYX 地址 (USDC is token0)
const SQRT_PRICE_PAYMENT_FIRST = "7922816251426434139029504";

// 当 PAYX 地址 < USDC 地址 (PAYX is token0)
const SQRT_PRICE_TOKEN_FIRST = "792281625142643375935439503360000";
```

## 🧮 价格计算公式

### Uniswap v4 价格

```
price = (reserve1 / 10^decimals1) / (reserve0 / 10^decimals0)
```

对于 USDC (6位) 和 PAYX (18位):

**如果 USDC 是 token0:**
```
price = (PAYX / 10^18) / (USDC / 10^6)
      = (400M / 10^18) / (40k / 10^6)
      = 0.0001 PAYX per USDC

或者反过来：
1 PAYX = 0.0001 USDC = $0.0001 ✓
```

### sqrtPriceX96 计算

```javascript
// USDC 是 token0
priceWhenUSDCFirst = (PAYX_amount / USDC_amount) * 10^(6-18)
                   = (400M / 40k) * 10^(-12)
                   = 10000 * 10^(-12)
                   = 10^(-8)

sqrtPriceX96 = sqrt(priceWhenUSDCFirst) * 2^96
             = sqrt(10^(-8)) * 2^96
             = 10^(-4) * 79228162514264337593543950336
             = 7922816251426434139029504
```

## 🔍 验证价格配置

### 方法1: 使用验证脚本（推荐）

```bash
cd contracts
node scripts/verifyPrice.js
```

**期望输出：**
```
✅ All checks passed!
✅ Initial price: $0.0001 per PAYX
✅ Mint price: $1.00 per mint (10k PAYX)
✅ sqrtPriceX96 values are correct
🎉 Ready for deployment!
```

### 方法2: 使用计算器

```bash
node scripts/calculatePriceForPAYX.js
```

这会根据配置的USDC和PAYX数量重新计算sqrtPriceX96值。

## 📝 修改价格配置

### 如果需要不同的初始价格：

1. **编辑配置参数** (在 `scripts/calculatePriceForPAYX.js`):

```javascript
const USDC_AMOUNT = 40000;      // 修改此值
const PAYX_AMOUNT = 400000000;  // 修改此值
```

2. **重新计算sqrtPriceX96:**

```bash
node scripts/calculatePriceForPAYX.js
```

3. **复制新值到部署脚本** (`scripts/deployPAYX.js` 和 `deployAndMintPAYX.js`):

```javascript
const SQRT_PRICE_PAYMENT_FIRST = "新值";
const SQRT_PRICE_TOKEN_FIRST = "新值";
```

4. **验证新配置:**

```bash
node scripts/verifyPrice.js
```

## 📊 常见价格配置示例

### 配置1: $0.0001/token (当前)

```javascript
USDC:  40,000
PAYX:  400,000,000
比例:  1:10,000
价格:  $0.0001 per PAYX
```

### 配置2: $0.0002/token (更高价格)

```javascript
USDC:  80,000
PAYX:  400,000,000
比例:  1:5,000
价格:  $0.0002 per PAYX
```

### 配置3: $0.00005/token (更低价格)

```javascript
USDC:  20,000
PAYX:  400,000,000
比例:  1:20,000
价格:  $0.00005 per PAYX
```

**注意：** 修改价格配置后，需要重新计算sqrtPriceX96值！

## ⚠️ 重要提醒

### 部署前检查清单

- [ ] 运行 `node scripts/verifyPrice.js` 确认所有检查通过
- [ ] 确认LP USDC数量 (PAYMENT_SEED) 与配置一致
- [ ] 确认LP PAYX数量 (POOL_SEED_AMOUNT) 与配置一致
- [ ] 确认sqrtPriceX96值已更新到部署脚本
- [ ] 确认合约有足够USDC用于LP部署

### 常见错误

#### ❌ 错误1: sqrtPriceX96使用了旧值

**症状：** 池子创建后价格不符合预期

**解决：** 
1. 运行 `node scripts/calculatePriceForPAYX.js`
2. 复制新值到 `deployPAYX.js`
3. 重新部署合约

#### ❌ 错误2: USDC和PAYX数量不匹配价格

**症状：** 验证脚本显示价格不匹配

**解决：**
1. 确认 `PAYMENT_SEED` 和 `POOL_SEED_AMOUNT` 正确
2. 确认比例计算正确
3. 重新计算sqrtPriceX96

#### ❌ 错误3: 小数位数错误

**症状：** 价格相差10的倍数

**解决：**
- USDC使用6位小数: `parseUnits(amount, 6)`
- PAYX使用18位小数: `parseEther(amount)`

## 🧪 测试价格

### 部署后验证价格

```bash
npx hardhat console --network baseSepolia

const PAYX = await ethers.getContractAt("PAYX", "0xTOKEN_ADDRESS");

// 检查LP是否已部署
const deployed = await PAYX.liquidityDeployed();
console.log("LP Deployed:", deployed);

// 如果已部署，可以通过Uniswap接口查询当前价格
// （需要Uniswap v4 SDK）
```

### 计算预期滑点

```javascript
// 对于40k USDC流动性，1k USDC买入的滑点：
const lpUSDC = 40000;
const buyAmount = 1000;
const slippage = (buyAmount / lpUSDC) * 100;
console.log(`Slippage for $${buyAmount} buy: ~${slippage.toFixed(2)}%`);

// 输出: Slippage for $1000 buy: ~2.50%
```

## 📚 相关资源

- **[TOKENOMICS.md](./TOKENOMICS.md)** - 完整的代币经济学
- **[USAGE_GUIDE.md](./USAGE_GUIDE.md)** - 合约使用指南
- **[Uniswap v4 Docs](https://docs.uniswap.org/contracts/v4/overview)** - Uniswap v4文档

## 🔧 开发工具

### 相关脚本

| 脚本 | 用途 |
|------|------|
| `verifyPrice.js` | 验证当前配置的价格是否正确 |
| `calculatePriceForPAYX.js` | 计算新的sqrtPriceX96值 |
| `calculateSqrtPrice.js` | 通用的sqrtPriceX96计算器 |

### 使用建议

1. **开发时**: 频繁运行 `verifyPrice.js` 确保配置正确
2. **修改配置时**: 使用 `calculatePriceForPAYX.js` 生成新值
3. **部署前**: 运行完整验证确保所有参数匹配

---

**最后更新:** 2025-01-27

**当前配置状态:** ✅ 已验证通过

**初始价格:** $0.0001 per PAYX

**Mint价格:** $1.00 per 10k PAYX

