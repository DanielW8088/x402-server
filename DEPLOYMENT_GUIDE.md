# PAYX 合约部署指南

完整的PAYX合约部署教程，包含生产环境和测试环境的部署方案。

## 目录

- [前置要求](#前置要求)
- [快速测试部署](#快速测试部署)
- [生产环境部署](#生产环境部署)
- [部署后配置](#部署后配置)
- [验证部署](#验证部署)
- [故障排除](#故障排除)

---

## 前置要求

### 1. 软件环境
- Node.js v18+
- npm 或 yarn
- Git（可选）

### 2. 网络资产

#### Base Sepolia 测试网
- **ETH**: 用于gas费用（部署需要约 0.01 ETH）
  - 获取: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
- **USDC**: 用于LP流动性（需要100,000 USDC）
  - 获取: https://faucet.circle.com/
  - 或使用Uniswap将ETH换为USDC

#### Base 主网
- **ETH**: 用于gas费用（部署需要约 0.01 ETH）
- **USDC**: 用于LP流动性（配置中的 PAYMENT_SEED 数量）

### 3. 准备工作

```bash
# 克隆项目（如果还没有）
cd examples/token-mint

# 安装依赖
cd contracts
npm install

# 创建环境配置文件
cp .env.example .env  # 如果存在
# 或手动创建
touch .env
```

### 4. 配置私钥

编辑 `contracts/.env`:

```bash
# 部署者私钥（拥有ETH和USDC的账户）
DEPLOYER_PRIVATE_KEY=0xYourPrivateKeyHere

# Base Sepolia RPC（可选，使用默认即可）
BASE_SEPOLIA_RPC=https://sepolia.base.org

# Basescan API Key（用于合约验证，可选）
BASESCAN_API_KEY=YourBasescanApiKey
```

---

## 快速测试部署

适用于开发和测试环境，一键部署并mint测试代币。

### 步骤 1: 部署+Mint

```bash
cd contracts
npx hardhat run scripts/deployAndMintPAYX.js --network baseSepolia
```

### 输出示例

```
🚀 Deploying PAYX + Mint Test...

📋 Configuration:
──────────────────────────────────────
Deployer: 0x1234...5678
Test Mint To: 0x1234...5678
Mint Amount: 10000.0 PAYX
──────────────────────────────────────

📦 Deploying PAYX...
✅ PAYX deployed: 0xAbcd...Ef01

⏳ Waiting for deployment confirmation...

🪙 Minting test tokens...
✅ Minted 10000.0 PAYX to 0x1234...5678
   TX Hash: 0x789...abc

📊 Contract State:
──────────────────────────────────────
Total Supply: 1,000,010,000.0 PAYX
Mint Count: 1 / 100000
User Balance: 10000.0 PAYX
LP Pre-minted: 1,000,000,000.0 PAYX
──────────────────────────────────────

🎯 Deployment Summary:
──────────────────────────────────────
Contract Address: 0xAbcd...Ef01
Test Mint: SUCCESS
Ready for testing ✓
──────────────────────────────────────
```

### 自定义mint接收地址

```bash
TEST_MINT_ADDRESS=0xYourTestAddress npx hardhat run scripts/deployAndMintPAYX.js --network baseSepolia
```

### 特点

✅ 一步完成部署和测试mint  
✅ 自动配置所有LP参数  
✅ 部署者自动获得 MINTER_ROLE  
✅ 立即可用于测试  

---

## 生产环境部署

完整的生产部署流程，适用于正式上线。

### 步骤 1: 配置部署参数

编辑 `contracts/scripts/deployPAYX.js`，根据需求修改配置：

```javascript
// Token配置
const TOKEN_NAME = "PAYX";
const TOKEN_SYMBOL = "PAYX";
const MINT_AMOUNT = hre.ethers.parseEther("10000"); // 每次mint数量
const MAX_MINT_COUNT = 100000; // 最大mint次数

// 流动性配置
const PAYMENT_SEED = hre.ethers.parseUnits("100000", 6); // 100k USDC
const POOL_SEED_AMOUNT = hre.ethers.parseEther("1000000000"); // 1B tokens

// 价格配置（自动计算，一般不需修改）
const SQRT_PRICE_PAYMENT_FIRST = "3961408125713216879041820949";
const SQRT_PRICE_TOKEN_FIRST = "792281625142643375935439503360";
```

**供应量说明:**
- 用户mint: `10,000 × 100,000 = 1B tokens`
- LP预铸造: `1B tokens`
- **总供应量: 2B tokens**（合约硬编码MAX_SUPPLY）

### 步骤 2: 确认USDC余额

部署前确保部署者账户有足够的USDC用于LP:

```bash
# 检查USDC余额
npx hardhat console --network baseSepolia
> const usdc = await ethers.getContractAt("IERC20", "0x036CbD53842c5426634e7929541eC2318f3dCF7e")
> const balance = await usdc.balanceOf("YOUR_ADDRESS")
> ethers.formatUnits(balance, 6)
```

如果余额不足，需要获取USDC后再部署。

### 步骤 3: 部署合约

```bash
cd contracts
npx hardhat run scripts/deployPAYX.js --network baseSepolia
```

### 步骤 4: 记录合约地址

部署成功后，记录输出的合约地址:

```
✅ PAYX deployed!
──────────────────────────────────────
📍 0xYourContractAddress
──────────────────────────────────────
```

**重要：将此地址保存到安全的地方！**

### 步骤 5: 转移USDC到合约

合约部署后，需要转移USDC用于LP部署：

```bash
# 方法1: 使用MetaMask等钱包直接转账
# 转到: 0xYourContractAddress
# 数量: 100,000 USDC（或配置的PAYMENT_SEED数量）

# 方法2: 使用hardhat console
npx hardhat console --network baseSepolia
> const usdc = await ethers.getContractAt("IERC20", "0x036CbD53842c5426634e7929541eC2318f3dCF7e")
> await usdc.transfer("0xYourContractAddress", ethers.parseUnits("100000", 6))
```

### 步骤 6: 授予服务器权限

```bash
# 设置环境变量
export TOKEN_CONTRACT_ADDRESS=0xYourContractAddress
export SERVER_ADDRESS=0xYourServerAddress

# 授予MINTER_ROLE
npx hardhat run scripts/grantRole.js --network baseSepolia
```

输出示例:
```
Granting MINTER_ROLE to 0xYourServerAddress
Token contract: 0xYourContractAddress
MINTER_ROLE: 0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6
Transaction sent: 0x123...
✅ MINTER_ROLE granted successfully
Verification: SUCCESS
```

---

## 部署后配置

### 1. 更新服务器环境变量

编辑 `server/.env`:

```bash
TOKEN_CONTRACT_ADDRESS=0xYourContractAddress
NETWORK=base-sepolia  # 或 base (主网)
SERVER_PRIVATE_KEY=0xYourServerPrivateKey
PAY_TO_ADDRESS=0xYourUSDCReceiverAddress
FACILITATOR_URL=https://x402.org/facilitator
PORT=4021
```

### 2. 设置LP Guard Hook（可选）

如果需要LP保护机制:

```bash
npx hardhat console --network baseSepolia
> const token = await ethers.getContractAt("PAYX", "0xYourContractAddress")
> await token.setLpGuardHook("0xYourHookAddress")
```

⚠️ **注意**: LP Guard Hook只能设置一次，且必须在LP部署前设置。

### 3. 启动服务器

```bash
cd server
npm install
npm run dev  # 开发环境
# 或
npm start    # 生产环境
```

### 4. 验证服务器

```bash
# 检查服务器状态
curl http://localhost:4021/info

# 应该返回:
{
  "price": "1 USDC",
  "tokensPerPayment": "10000000000000000000000",
  "contractAddress": "0xYourContractAddress",
  "network": "base-sepolia"
}
```

---

## 验证部署

### 方法1: 使用检查脚本

```bash
cd contracts
TOKEN_CONTRACT_ADDRESS=0xYourContractAddress npx hardhat run scripts/checkPAYX.js --network baseSepolia
```

### 方法2: 使用Hardhat Console

```bash
npx hardhat console --network baseSepolia
```

```javascript
// 连接到合约
const token = await ethers.getContractAt("PAYX", "0xYourContractAddress")

// 检查基本信息
await token.name()           // "PAYX"
await token.symbol()         // "PAYX"
await token.totalSupply()    // 1B (LP预铸造)
await token.MAX_SUPPLY()     // 2B
await token.mintCount()      // 当前mint次数
await token.maxMintCount()   // 100000

// 检查LP状态
await token.liquidityDeployed()  // false (未达到max mint)
await token.paymentSeed()        // 100000 USDC (单位: 6 decimals)

// 检查角色
const MINTER_ROLE = await token.MINTER_ROLE()
await token.hasRole(MINTER_ROLE, "0xServerAddress")  // 应该是 true
```

### 方法3: 在区块链浏览器验证

访问 https://sepolia.basescan.org/address/0xYourContractAddress

检查:
- ✅ 合约已验证（如果运行了验证）
- ✅ 总供应量正确
- ✅ 有USDC余额（用于LP）

---

## 常用操作

### 手动Mint代币

```bash
npx hardhat console --network baseSepolia
```

```javascript
const token = await ethers.getContractAt("PAYX", "0xYourContractAddress")
const txHash = ethers.keccak256(ethers.toUtf8Bytes("unique-tx-hash"))
await token.mint("0xRecipientAddress", txHash)
```

### 批量Mint

```javascript
const addresses = ["0xAddr1", "0xAddr2", "0xAddr3"]
const txHashes = addresses.map((_, i) => 
  ethers.keccak256(ethers.toUtf8Bytes(`tx-${i}-${Date.now()}`))
)
await token.batchMint(addresses, txHashes)
```

### 收集LP费用

当LP部署后，可以收集交易费用:

```javascript
// 只有admin可以调用
await token.collectLpFees()
```

### 紧急提款

⚠️ **仅在LP未部署前可用**，用于紧急情况下回收资金:

```javascript
// 只能调用一次
await token.emergencyWithdraw()
```

### 提取其他代币

如果合约收到其他ERC20代币:

```javascript
await token.withdrawToken("0xTokenAddress", amount)
```

---

## 部署到主网

### 配置差异

主网部署配置与测试网相同，但需要修改:

1. **网络参数**:
```javascript
// hardhat.config.js 已配置 base 网络
// 使用: --network base
```

2. **合约地址**:
```javascript
// Base 主网地址 (已在deployPAYX.js中配置)
const POOL_MANAGER = "0x...";      // Base主网PoolManager
const POSITION_MANAGER = "0x...";  // Base主网PositionManager
const PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3";  // 通用
const PAYMENT_TOKEN = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";  // Base USDC
```

3. **真实USDC**: 主网需要真实的USDC，不能使用测试币。

### 主网部署命令

```bash
# 确保有足够的ETH和USDC
npx hardhat run scripts/deployPAYX.js --network base
```

---

## 故障排除

### 错误: "insufficient funds for gas"

**原因**: 部署者账户ETH不足

**解决**: 
- 测试网: 从水龙头获取 ETH
- 主网: 转入足够的 ETH

### 错误: "replacement transaction underpriced"

**原因**: Nonce或gas价格冲突

**解决**: 
- 等待几秒后重试
- 使用 `deployAndMintPAYX.js` (已处理此问题)

### 警告: "Need 100000 USDC for LP"

**原因**: 部署者USDC余额不足

**解决**: 
- 测试网: 从Circle水龙头获取USDC
- 主网: 转入足够的USDC
- 或修改 `PAYMENT_SEED` 配置为更小的值

### 错误: "AlreadyMinted"

**原因**: txHash已被使用

**解决**: 
```javascript
// 使用唯一的txHash
const txHash = ethers.keccak256(ethers.toUtf8Bytes(`unique-${Date.now()}`))
```

### 错误: "MaxMintCountExceeded"

**原因**: 已达到最大mint次数

**解决**: 
- 这是正常的，表示LP即将自动部署
- 检查LP状态: `await token.liquidityDeployed()`

### 错误: "MaxSupplyExceeded"

**原因**: 超过2B硬编码的最大供应量

**解决**: 
- 无法解决，这是硬编码限制
- 需要重新部署合约并修改MAX_SUPPLY

### 合约验证失败

**解决**:

手动验证:
```bash
npx hardhat verify --network baseSepolia 0xYourContractAddress \
  "PAYX" \
  "PAYX" \
  "10000000000000000000000" \
  "100000" \
  "0x7da1d65f8b249183667cde74c5cbd46dd38aa829" \
  "0xc01ee65a5087409013202db5e1f77e3b74579abf" \
  "0x000000000022d473030f116ddee9f6b43ac78ba3" \
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e" \
  "100000000000" \
  "1000000000000000000000000000" \
  "3961408125713216879041820949" \
  "792281625142643375935439503360"
```

---

## 配置速查表

### Base Sepolia (测试网)

```javascript
// Uniswap v4
POOL_MANAGER = "0x7da1d65f8b249183667cde74c5cbd46dd38aa829"
POSITION_MANAGER = "0xc01ee65a5087409013202db5e1f77e3b74579abf"
PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3"

// USDC
PAYMENT_TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e"

// 水龙头
ETH: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
USDC: https://faucet.circle.com/

// 浏览器
https://sepolia.basescan.org/
```

### Base Mainnet (主网)

```javascript
// Uniswap v4
POOL_MANAGER = "0x..." // 待配置
POSITION_MANAGER = "0x..." // 待配置
PERMIT2 = "0x000000000022d473030f116ddee9f6b43ac78ba3"

// USDC
PAYMENT_TOKEN = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"

// 浏览器
https://basescan.org/
```

---

## 检查清单

部署前:
- [ ] 安装所有依赖 (`npm install`)
- [ ] 配置私钥 (`.env`)
- [ ] 部署者有足够ETH (>0.01 ETH)
- [ ] 部署者有足够USDC (配置的PAYMENT_SEED数量)
- [ ] 审核配置参数 (token名称、mint数量等)

部署后:
- [ ] 记录合约地址
- [ ] 转移USDC到合约（用于LP）
- [ ] 授予服务器MINTER_ROLE
- [ ] 更新服务器.env配置
- [ ] 启动服务器
- [ ] 测试mint功能
- [ ] 验证合约（可选）
- [ ] 设置LP Guard Hook（可选）

---

## 相关文档

- [QUICKSTART.md](./QUICKSTART.md) - 快速开始指南
- [ARCHITECTURE.md](./ARCHITECTURE.md) - 架构文档
- [SUPPLY_CAP.md](./SUPPLY_CAP.md) - 供应量配置
- [ENV_CONFIGURATION.md](./ENV_CONFIGURATION.md) - 环境配置详解

## 支持

- x402 协议: https://x402.org
- Base 文档: https://docs.base.org
- Uniswap v4: https://docs.uniswap.org/
- Hardhat 文档: https://hardhat.org/docs

---

**祝部署顺利！** 🚀

