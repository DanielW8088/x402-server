# X402Token 完整指南

**完整版代币系统** - 类似Ping，支持自定义配置

## 🎯 核心特性

### 与Ping相同
✅ **EIP-3009** - 代币本身支持gasless转账  
✅ **Uniswap v4自动部署** - Mint完成后自动创建流动性池  
✅ **LP管理** - 协议持有LP，收取交易费  
✅ **x402支付** - 用户支付USDC即可mint  

### 增强功能
✅ **可配置代币名称和符号** - 构造函数参数  
✅ **1B供应硬上限** - 防止超发  
✅ **供应查询** - `maxSupply()`, `remainingSupply()`  

---

## 📦 项目结构

```
token-mint/
├── contracts/
│   ├── X402Token.sol                 # 完整版合约（新）
│   ├── MintToken.sol                 # 简化版合约（旧）
│   └── scripts/
│       ├── deployX402Token.js        # X402Token部署脚本
│       ├── calculateSqrtPrice.js     # 价格计算工具
│       ├── grantRole.js              # 授权脚本
│       └── checkStatus.js            # 状态检查
│
└── server/
    └── index.ts                      # x402服务器（同样适用）
```

---

## 🚀 快速开始

### 1️⃣ 配置部署参数

编辑 `contracts/scripts/deployX402Token.js`:

```javascript
// 代币配置
const TOKEN_NAME = "MyToken";        // 你的代币名称
const TOKEN_SYMBOL = "MTK";          // 你的代币符号
const MINT_AMOUNT = hre.ethers.parseEther("10000");  // 每次mint数量
const MAX_MINT_COUNT = 100000;       // 最大mint次数

// Uniswap v4 配置
const POOL_MANAGER = "0x...";        // 获取Base的地址
const POSITION_MANAGER = "0x...";
const PERMIT2 = "0x...";

// 支付代币 (USDC)
const PAYMENT_TOKEN = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";  // Base Sepolia
const PAYMENT_SEED = hre.ethers.parseUnits("100000", 6);  // 100k USDC for LP
const POOL_SEED_AMOUNT = hre.ethers.parseEther("500000000");  // 500M tokens for LP

// 价格配置 (sqrtPriceX96) - 使用计算工具生成
const SQRT_PRICE_PAYMENT_FIRST = "5602277097478614411626293834203267072";
const SQRT_PRICE_TOKEN_FIRST = "1120455419495722778624";
```

### 2️⃣ 获取Uniswap v4地址

**Base Sepolia测试网**:
```
POOL_MANAGER: 0x...       # 查询Uniswap v4文档
POSITION_MANAGER: 0x...
PERMIT2: 0x...
```

**Base主网**:
```
POOL_MANAGER: 0x...
POSITION_MANAGER: 0x...  
PERMIT2: 0x...
```

### 3️⃣ 计算价格参数

运行价格计算工具：

```bash
node contracts/scripts/calculateSqrtPrice.js
```

修改脚本中的比例，例如：
```javascript
const usdcAmount = 100000;      // 100k USDC
const tokenAmount = 500000000;  // 500M tokens
// 结果: 1 token = $0.0002
```

### 4️⃣ 准备USDC

合约需要USDC用于LP部署：

```bash
# 需要准备的USDC = PAYMENT_SEED
# 例如: 100,000 USDC

# 在部署后转账到合约地址
```

### 5️⃣ 部署合约

```bash
cd contracts
npm install
cp .env.example .env
# 编辑.env添加DEPLOYER_PRIVATE_KEY

npm run deploy:x402:sepolia
```

输出示例：
```
✅ X402Token deployed successfully!
──────────────────────────────────────
📍 Contract Address: 0x1234567890abcdef...
──────────────────────────────────────
```

### 6️⃣ 转账USDC到合约

```bash
# 转账100k USDC到合约地址
# 用于自动LP部署
```

### 7️⃣ 授权服务器

```bash
export TOKEN_CONTRACT_ADDRESS=0x1234...
export SERVER_ADDRESS=0xYourServer...
npm run grant:sepolia
```

### 8️⃣ 启动x402服务器

```bash
cd ../server
npm install
cp .env.example .env

# 编辑.env:
# TOKEN_CONTRACT_ADDRESS=0x1234...
# PAY_TO_ADDRESS=0xYourAddress...
# SERVER_PRIVATE_KEY=0x...

npm run dev
```

### 9️⃣ 测试

```bash
cd ../client
npm install
cp .env.example .env
# 配置私钥

npm start
```

---

## 🔧 详细配置说明

### 代币参数

#### TOKEN_NAME & TOKEN_SYMBOL
```javascript
const TOKEN_NAME = "Awesome Token";   // 显示名称
const TOKEN_SYMBOL = "AWE";          // 交易符号(通常3-5字符)
```

#### MINT_AMOUNT
```javascript
// 每次支付mint的代币数量
const MINT_AMOUNT = hre.ethers.parseEther("10000");  // 10,000代币

// 其他示例:
// 1,000代币:  parseEther("1000")
// 50,000代币: parseEther("50000")
```

#### MAX_MINT_COUNT
```javascript
// 最大mint次数
const MAX_MINT_COUNT = 100000;  // 100,000次

// 计算最大供应:
// MAX_MINT_COUNT * MINT_AMOUNT = 100,000 * 10,000 = 1B ✅

// 注意: 不能超过1B硬上限！
// 如果 MAX_MINT_COUNT * MINT_AMOUNT > 1B，会在mint时失败
```

### 流动性配置

#### PAYMENT_SEED
```javascript
// LP中的USDC数量
const PAYMENT_SEED = hre.ethers.parseUnits("100000", 6);  // 100k USDC

// 注意USDC是6位小数！
```

#### POOL_SEED_AMOUNT
```javascript
// LP中的代币数量
const POOL_SEED_AMOUNT = hre.ethers.parseEther("500000000");  // 500M tokens

// 比例例子:
// 100k USDC : 500M tokens
// 1 USDC = 5,000 tokens
// 1 token = $0.0002
```

#### 价格比例

使用 `calculateSqrtPrice.js` 计算:

```javascript
// 示例配置
const usdcAmount = 100000;      // 100k
const tokenAmount = 500000000;  // 500M

// 运行后得到:
// SQRT_PRICE_PAYMENT_FIRST = "5602277097478614411626293834203267072"
// SQRT_PRICE_TOKEN_FIRST = "1120455419495722778624"
```

### 自定义价格比例

想要不同的初始价格？修改 `calculateSqrtPrice.js`:

#### 例子1: 更高的token价格
```javascript
const usdcAmount = 100000;      // 100k USDC
const tokenAmount = 100000000;  // 100M tokens (而不是500M)
// 结果: 1 token = $0.001 (5倍价格)
```

#### 例子2: 更低的token价格
```javascript
const usdcAmount = 50000;       // 50k USDC
const tokenAmount = 500000000;  // 500M tokens
// 结果: 1 token = $0.0001 (一半价格)
```

---

## 📊 供应和经济模型

### 供应计算

```
MAX_SUPPLY = 1,000,000,000 (1B) - 硬编码，无法修改

最大Mint次数 = MAX_SUPPLY / MINT_AMOUNT
例如: 1B / 10,000 = 100,000次

实际Mint限制 = min(MAX_MINT_COUNT, 最大Mint次数)
```

### 示例配置

#### 配置1: 标准 (默认)
```
MINT_AMOUNT = 10,000
MAX_MINT_COUNT = 100,000
最多用户 = 100,000人
预期收入 = $100,000 (假设$1/mint)
```

#### 配置2: 高频小额
```
MINT_AMOUNT = 1,000
MAX_MINT_COUNT = 1,000,000
最多用户 = 1,000,000人
预期收入 = $1,000,000 (假设$1/mint)
```

#### 配置3: 低频大额
```
MINT_AMOUNT = 100,000
MAX_MINT_COUNT = 10,000
最多用户 = 10,000人
预期收入 = $10,000 (假设$1/mint)
```

---

## 🎮 自动LP部署

### 触发时机

```solidity
if (_mintCount == MAX_MINT_COUNT) {
    _initializePoolAndDeployLiquidity(10_000, 200);
}
```

当mint次数达到`MAX_MINT_COUNT`时，自动：

1. ✅ 创建Uniswap v4池子
2. ✅ 从合约mint `POOL_SEED_AMOUNT`代币
3. ✅ 使用合约中的USDC (`PAYMENT_SEED`)
4. ✅ 添加全范围流动性
5. ✅ 协议持有LP NFT

### 前置条件

- ✅ 合约必须有足够USDC (`PAYMENT_SEED`)
- ✅ `lpGuardHook`已设置（可选）
- ✅ Uniswap v4合约地址正确

### LP管理

部署后，可以：

```solidity
// 收取交易费
function collectLpFees() external onlyRole(DEFAULT_ADMIN_ROLE)

// 紧急提取（LP部署前）
function emergencyWithdraw() external onlyRole(DEFAULT_ADMIN_ROLE)
```

---

## 🔐 EIP-3009 Gasless转账

合约内置EIP-3009支持，用户转账代币时也是gasless：

### 使用方式

```typescript
// 用户签名授权
const authorization = {
  from: userAddress,
  to: recipientAddress,
  value: amount,
  validAfter: Math.floor(Date.now() / 1000) - 60,
  validBefore: Math.floor(Date.now() / 1000) + 3600,
  nonce: randomBytes32()
};

// 使用EIP-712签名
const signature = await signTypedData(authorization);

// 任何人都可以提交（支付gas）
await token.transferWithAuthorization(
  authorization.from,
  authorization.to,
  authorization.value,
  authorization.validAfter,
  authorization.validBefore,
  authorization.nonce,
  signature.v,
  signature.r,
  signature.s
);
```

### 应用场景

- 💰 **链下支付** - 用户签名，商家提交
- 🎁 **空投** - 用户签名，项目方统一提交
- 🔄 **中继服务** - 用户签名，中继器支付gas

---

## 📋 合约脚本命令

```bash
# 部署X402Token
npm run deploy:x402:sepolia
npm run deploy:x402:mainnet

# 授权MINTER_ROLE
npm run grant:sepolia
npm run grant:mainnet

# 检查状态
npm run status:sepolia
npm run status:mainnet

# 验证合约
npm run verify -- <address> <args...>

# 计算价格
node scripts/calculateSqrtPrice.js
```

---

## 🆚 X402Token vs MintToken

| 特性 | X402Token | MintToken |
|------|-----------|-----------|
| **代币配置** | ✅ 构造函数 | ❌ 固定 |
| **EIP-3009** | ✅ | ❌ |
| **Uniswap v4** | ✅ 自动部署 | ❌ |
| **LP管理** | ✅ | ❌ |
| **供应上限** | ✅ 1B | ✅ 1B |
| **Gas成本** | 高 | 低 |
| **部署复杂度** | 高（需要v4地址） | 低 |
| **适用场景** | 完整DeFi项目 | 简单分发 |

---

## 🎯 最佳实践

### 1. 部署前

- [ ] 计算好所有参数
- [ ] 准备足够的USDC
- [ ] 测试网完整测试
- [ ] 确认Uniswap v4地址

### 2. 部署时

- [ ] 验证所有参数
- [ ] 记录合约地址
- [ ] 在区块链浏览器验证
- [ ] 转账USDC到合约

### 3. 部署后

- [ ] 授权服务器MINTER_ROLE
- [ ] 设置LP Guard Hook（如需要）
- [ ] 启动x402服务器
- [ ] 端到端测试

### 4. 运营中

- [ ] 监控mint进度
- [ ] 监控合约USDC余额
- [ ] 准备LP部署
- [ ] 收取LP费用

---

## 🐛 故障排除

### "Insufficient USDC for LP"
合约没有足够USDC用于LP部署。

**解决**: 转账`PAYMENT_SEED`数量的USDC到合约地址。

### "MaxSupplyExceeded"
Mint会超过1B上限。

**解决**: 检查`MAX_MINT_COUNT * MINT_AMOUNT <= 1B`

### "Uniswap pool initialization failed"
Uniswap v4地址错误或网络不匹配。

**解决**: 确认POOL_MANAGER等地址正确。

### "LP already deployed"
已经部署过LP了。

**解决**: 这是正常的，LP只会部署一次。

---

## 📚 资源

- [Uniswap v4 文档](https://docs.uniswap.org/contracts/v4/overview)
- [EIP-3009 规范](https://eips.ethereum.org/EIPS/eip-3009)
- [x402 协议](https://x402.org)
- [Base 文档](https://docs.base.org)

---

## 💡 快速参考

### 修改代币名称
```javascript
// deployX402Token.js
const TOKEN_NAME = "YourToken";
const TOKEN_SYMBOL = "YTK";
```

### 修改mint数量
```javascript
// deployX402Token.js
const MINT_AMOUNT = hre.ethers.parseEther("50000");
```

### 修改初始价格
```bash
# 1. 编辑calculateSqrtPrice.js
# 2. 修改usdcAmount和tokenAmount
# 3. 运行脚本获取新的sqrtPrice值
node scripts/calculateSqrtPrice.js

# 4. 更新deployX402Token.js中的SQRT_PRICE值
```

### 部署到主网
```javascript
// hardhat.config.js - 确保配置了base网络
// deployX402Token.js - 修改所有地址为主网地址
// .env - 使用主网RPC

npm run deploy:x402:mainnet
```

---

## 🎉 总结

X402Token 是一个**生产级**的完整代币系统：

- ✅ **灵活配置** - 代币名称、数量、价格
- ✅ **自动化** - LP自动部署
- ✅ **Gasless** - EIP-3009代币转账
- ✅ **x402集成** - 支付即mint
- ✅ **供应保护** - 1B硬上限
- ✅ **协议收入** - LP交易费

开始使用:
```bash
cd contracts
npm run deploy:x402:sepolia
```

祝你成功！🚀
