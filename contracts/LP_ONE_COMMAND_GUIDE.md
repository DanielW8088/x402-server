# 🚀 一键部署流动性池指南

## 📋 概述

现在只需**一条命令**即可完成整个 LP 部署流程！

`deployFullLiquidityFlow.js` 脚本会自动处理：

1. ✅ 预检查（minting 完成、LP 未上线等）
2. ✅ **自动设置 LaunchTool 白名单**（如已设置则跳过）
3. ✅ 转移资产到 LP deployer
4. ✅ 批准代币到 LaunchTool
5. ✅ 计算池子参数（价格、tick、数量）
6. ✅ 创建 Uniswap V3 池子并添加流动性
7. ✅ 确认 LP 上线状态
8. ✅ 验证部署
9. ✅ 清理剩余余额

**无需手动运行 `setLaunchTool.js`** - 脚本会自动检查并设置！

---

## 🎯 快速开始

### 准备工作

1. **确保 Token 已部署**
   - Minting 已完成
   - LP 尚未上线

2. **部署 LaunchTool**（如果还没有）
   ```bash
   cd contracts
   npx hardhat run scripts/deployLaunchTool.js --network baseSepolia
   ```
   保存返回的 LaunchTool 地址

3. **准备 USDC**
   - 确保钱包有足够的 USDC
   - 计算公式: `需要的 USDC = Token 总量 × 目标价格`
   - 例如: 25,000 Token × 0.0001 USDC = 2.5 USDC

---

## 🚀 一键部署

### Base Sepolia (测试网)

```bash
cd contracts

TOKEN_ADDRESS=0xYourTokenAddress \
LAUNCH_TOOL_ADDRESS=0xYourLaunchToolAddress \
TARGET_PRICE_USDC=0.0001 \
npx hardhat run scripts/deployFullLiquidityFlow.js --network baseSepolia
```

### Base Mainnet (主网)

```bash
cd contracts

TOKEN_ADDRESS=0xYourTokenAddress \
LAUNCH_TOOL_ADDRESS=0xYourLaunchToolAddress \
TARGET_PRICE_USDC=0.0001 \
FEE_TIER=10000 \
npx hardhat run scripts/deployFullLiquidityFlow.js --network base
```

---

## ⚙️ 参数说明

### 必需参数

| 参数 | 说明 | 示例 |
|------|------|------|
| `TOKEN_ADDRESS` | X402Token 合约地址 | `0x351ab4061ea605877fc0c4359140bcf13943d206` |
| `LAUNCH_TOOL_ADDRESS` | LaunchTool 合约地址 | `0x91cAfe77F5266FEa14f6db43Bb73BeF6ba80c609` |
| `TARGET_PRICE_USDC` | 目标初始价格（1 Token = ? USDC） | `0.0001` |

### 可选参数

| 参数 | 说明 | 默认值 | 可选值 |
|------|------|--------|--------|
| `FEE_TIER` | 池子手续费率 | `10000` (1%) | `500` (0.05%), `3000` (0.3%), `10000` (1%) |
| `TICK_RANGE_WIDTH` | Tick 范围宽度倍数 | `100` | 任何正整数 |

---

## 📝 完整示例

### 示例 1: 低价 meme token

```bash
# 1 Token = 0.0001 USDC
# 25,000 Token 需要 2.5 USDC

TOKEN_ADDRESS=0x351ab4061ea605877fc0c4359140bcf13943d206 \
LAUNCH_TOOL_ADDRESS=0x91cAfe77F5266FEa14f6db43Bb73BeF6ba80c609 \
TARGET_PRICE_USDC=0.0001 \
FEE_TIER=10000 \
npx hardhat run scripts/deployFullLiquidityFlow.js --network baseSepolia
```

### 示例 2: 中等价格 token

```bash
# 1 Token = 0.5 USDC
# 10,000 Token 需要 5,000 USDC

TOKEN_ADDRESS=0xYourToken \
LAUNCH_TOOL_ADDRESS=0xYourLaunchTool \
TARGET_PRICE_USDC=0.5 \
FEE_TIER=3000 \
npx hardhat run scripts/deployFullLiquidityFlow.js --network base
```

### 示例 3: 高价 token

```bash
# 1 Token = 100 USDC
# 1,000 Token 需要 100,000 USDC

TOKEN_ADDRESS=0xYourToken \
LAUNCH_TOOL_ADDRESS=0xYourLaunchTool \
TARGET_PRICE_USDC=100 \
FEE_TIER=500 \
TICK_RANGE_WIDTH=50 \
npx hardhat run scripts/deployFullLiquidityFlow.js --network base
```

---

## 🔍 执行流程

脚本会自动显示详细的执行步骤：

```
╔════════════════════════════════════════════════════════════╗
║       Complete LP Deployment Flow for X402Token           ║
╚════════════════════════════════════════════════════════════╝

🌐 Network: baseSepolia (Chain ID: 84532)

⚙️  Configuration:
  Token Address: 0x...
  LaunchTool Address: 0x...
  Target Price: 1 Token = 0.0001 USDC
  Fee Tier: 1%

🔑 Signer: 0x...

📋 Step A: Pre-deployment Checks
============================================================
  Minting Status: ✓ Completed
  Assets Transferred: false
  LP Live: false
  ...

🛠️  Step A2: Configure LaunchTool Whitelist
============================================================
  Current LaunchTool: 0x0000000000000000000000000000000000000000
  Target LaunchTool: 0x91cAfe77F5266FEa14f6db43Bb73BeF6ba80c609
  
  Setting LaunchTool...
  ✅ LaunchTool updated!
  🎉 LaunchTool is now whitelisted for token transfers!

💸 Step A3: Transfer Assets for LP
============================================================
  ✓ Assets already transferred, skipping...

🔧 Step B: Prepare LP Deployer Account
============================================================
  LP Deployer Balances:
    - Token: 25000.0
    - USDC: 6.5
  
  Approving tokens to LaunchTool...
  ✅ Tokens approved!

🧮 Step B3-6: Calculate Pool Parameters
============================================================
  Amount Calculation:
    - Token amount: 25000.000000 Token
    - Target price: 1 Token = 0.0001 USDC
    - Required USDC: 2.500000 USDC
  
  Token Ordering:
    - token0: USDC
    - token1: Token
  
  Price Configuration:
    - sqrtPriceX96: 7922816251426433759354395033600
  
  Tick Range:
    - tickLower: 72000
    - tickUpper: 112000

🏊 Step C: Create Pool and Add Liquidity
============================================================
  Calling LaunchTool.configurePoolByAmount()...
  ✅ Pool created!
  Pool Address: 0x...
  Position ID: 123

✅ Step D: Confirm LP Live
============================================================
  ✅ LP confirmed live!

🔍 Step E: Verification
============================================================
  Pool Address: 0x...
  Current Price: 0.0001 USDC per Token
  LP Live Status: true

🧹 Step E5: Cleanup
============================================================
  ✓ No leftover balances

╔════════════════════════════════════════════════════════════╗
║                    ✅ DEPLOYMENT COMPLETE!                  ║
╚════════════════════════════════════════════════════════════╝

🎉 Pool Address: 0x...
🎉 Position ID: 123
```

---

## ✅ 成功标准

部署成功后，你应该看到：

- [x] **LaunchTool 已自动设置**
  ```
  🛠️  Step A2: Configure LaunchTool Whitelist
  ✅ LaunchTool updated!
  ```

- [x] **池子已创建**
  ```
  Pool Address: 0x...
  ```

- [x] **流动性已添加**
  ```
  Liquidity: 394269826
  ```

- [x] **LP 已确认上线**
  ```
  LP Live Status: true
  ```

- [x] **价格正确**
  ```
  Current Price: 0.0001 USDC per Token
  ```

---

## 🧪 部署后测试

### 1. 快速验证

```bash
# 查看池子信息
POOL_ADDRESS=0xYourPoolAddress \
npx hardhat run scripts/testPool.js --network baseSepolia
```

### 2. 测试交易报价

```bash
# 测试用 1 USDC 买 Token
POOL_ADDRESS=0xYourPoolAddress \
AMOUNT_IN=1 \
npx hardhat run scripts/testSwap.js --network baseSepolia
```

### 3. 检查 Token 状态

```bash
TOKEN_ADDRESS=0xYourToken \
npx hardhat run scripts/checkTokenLpStatus.js --network baseSepolia
```

### 4. 在 Uniswap 测试

访问: https://app.uniswap.org/#/swap?chain=base_sepolia

1. 连接钱包
2. 导入你的 Token (粘贴地址)
3. 尝试交易 USDC ↔ Token

---

## 🐛 常见问题

### 问题 1: "LaunchTool already set correctly"

**说明**: LaunchTool 已经正确设置，脚本会自动跳过此步骤继续执行。

**操作**: 无需操作，这是正常的。

---

### 问题 2: "Insufficient USDC"

**原因**: 钱包 USDC 余额不足。

**解决**:
```bash
# 检查需要多少 USDC
需要的 USDC = Token 数量 × 目标价格

# 示例: 25,000 Token × 0.0001 = 2.5 USDC
```

获取测试网 USDC:
- Base Sepolia Faucet: https://faucet.circle.com/

---

### 问题 3: "Signer is not the owner"

**原因**: 当前钱包不是 Token 的 owner。

**解决**: 使用部署 Token 时的钱包地址。

---

### 问题 4: "LP is already live"

**原因**: LP 已经部署过了。

**解决**: 
- 无需重新部署
- 使用 `testPool.js` 查看现有池子状态

---

### 问题 5: "Price slippage check"

**原因**: Tick 计算问题（已在最新版本修复）。

**解决**: 
1. 确保使用最新版本的脚本
2. 或调整 `TICK_RANGE_WIDTH` 参数（增大）

---

## 📚 相关脚本

| 脚本 | 用途 | 何时使用 |
|------|------|----------|
| `deployFullLiquidityFlow.js` | **一键部署 LP** | 主要使用这个！ |
| `setLaunchTool.js` | 单独设置 LaunchTool | ~~已整合，无需单独使用~~ |
| `testPool.js` | 查看池子信息 | 部署后验证 |
| `testSwap.js` | 测试交易报价 | 验证池子功能 |
| `checkTokenLpStatus.js` | 检查 Token 状态 | 排查问题 |

---

## 🎉 下一步

LP 部署成功后：

1. **更新前端**
   - Token 应显示 "LP Live" 状态
   - 用户可以自由转账

2. **监控池子**
   - 在 BaseScan 查看交易
   - 在 Uniswap Info 查看统计

3. **添加更多流动性**（可选）
   - 通过 Uniswap 界面
   - 或通过 Position Manager

4. **准备主网部署**
   - 使用相同流程
   - 确保有足够的真实 USDC
   - 谨慎选择初始价格

---

## 💡 提示

1. **首次部署建议在测试网练习**
   - Base Sepolia 免费测试
   - 熟悉整个流程
   - 验证所有功能

2. **价格设置建议**
   - 过低: < $0.0001 (高波动 meme token)
   - 中等: $0.01 - $1 (普通 token)
   - 过高: > $10 (premium token)

3. **手续费层级选择**
   - 0.05% (500): 稳定币对
   - 0.3% (3000): 标准交易对
   - 1% (10000): 高波动交易对

4. **Tick 范围建议**
   - 较窄范围 (50-100): 更高资金效率，但价格波动时可能失效
   - 较宽范围 (100-200): 更稳定，适合大多数情况
   - 很宽范围 (200+): 最稳定，但资金效率较低

---

## 🔗 有用链接

**Base Sepolia:**
- Explorer: https://sepolia.basescan.org/
- Uniswap: https://app.uniswap.org/#/swap?chain=base_sepolia
- USDC Faucet: https://faucet.circle.com/

**Base Mainnet:**
- Explorer: https://basescan.org/
- Uniswap: https://app.uniswap.org/#/swap?chain=base
- Uniswap Info: https://info.uniswap.org/#/base/

---

## 📞 需要帮助？

如果遇到问题：

1. 检查 **常见问题** 部分
2. 使用 `testPool.js` 和 `checkTokenLpStatus.js` 诊断
3. 查看 BaseScan 上的交易详情
4. 检查钱包余额和权限

**记住**: 一切都是自动的！只需一条命令即可完成整个流程！🚀

