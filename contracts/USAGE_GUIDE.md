# PAYX 合约使用文档

完整的PAYX合约调用指南，包含所有功能和脚本使用方法。

---

## 目录

1. [快速开始](#快速开始)
2. [合约部署](#合约部署)
3. [权限管理](#权限管理)
4. [Mint功能](#mint功能)
5. [资金管理](#资金管理)
6. [流动性管理](#流动性管理)
7. [EIP-3009功能](#eip-3009功能)
8. [查询功能](#查询功能)
9. [常见问题](#常见问题)

---

## 快速开始

### 环境要求

```bash
# 安装依赖
cd contracts
npm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入 PRIVATE_KEY
```

### 最小化部署流程

```bash
# 1. 部署合约
npx hardhat run scripts/deployPAYX.js --network baseSepolia

# 2. 记录合约地址，设置环境变量
export TOKEN_CONTRACT_ADDRESS=0x...

# 3. 转入USDC用于流动性
TOKEN_CONTRACT_ADDRESS=0x... USDC_AMOUNT=40000 \
  npx hardhat run scripts/fundContract.js --network baseSepolia

# 4. 授予server minter权限
TOKEN_CONTRACT_ADDRESS=0x... SERVER_ADDRESS=0x... \
  npx hardhat run scripts/grantRole.js --network baseSepolia

# 5. 开始接收用户mint请求
```

---

## 合约部署

### 方法1: 标准部署

使用默认配置（20/80分配模型）部署：

```bash
npx hardhat run scripts/deployPAYX.js --network baseSepolia
```

**配置参数（在脚本中）：**
```javascript
TOKEN_NAME = "PAYX"
TOKEN_SYMBOL = "PAYX"
MINT_AMOUNT = 10,000 PAYX per payment
MAX_MINT_COUNT = 160,000 (total 1.6B for users)
POOL_SEED_AMOUNT = 400M PAYX (20%, pre-minted on deploy)
PAYMENT_SEED = 40,000 USDC (for LP)
```

### 方法2: 部署并测试mint

部署后立即执行一次测试mint：

```bash
npx hardhat run scripts/deployAndMintPAYX.js --network baseSepolia

# 或指定接收地址
TEST_MINT_ADDRESS=0x... \
  npx hardhat run scripts/deployAndMintPAYX.js --network baseSepolia
```

### 部署后检查

```bash
# 查看合约状态
TOKEN_CONTRACT_ADDRESS=0x... \
  npx hardhat run scripts/checkPAYX.js --network baseSepolia
```

**输出示例：**
```
Contract: 0x123...
Total Supply: 400,000,000 PAYX (pre-minted LP)
Mint Count: 0 / 160,000
Liquidity Deployed: No
USDC Balance: 0
```

---

## 权限管理

### 角色说明

PAYX使用OpenZeppelin AccessControl，有两个角色：

| 角色 | 权限 | 用途 |
|------|------|------|
| `DEFAULT_ADMIN_ROLE` | 管理员权限 | 管理角色、提取资金、设置hook |
| `MINTER_ROLE` | Mint权限 | 调用mint和batchMint |

### 授予Minter角色

**给server授予mint权限：**

```bash
# 方法1: 使用脚本
TOKEN_CONTRACT_ADDRESS=0x... SERVER_ADDRESS=0x... \
  npx hardhat run scripts/grantRole.js --network baseSepolia

# 方法2: 命令行参数
npx hardhat run scripts/grantRole.js --network baseSepolia \
  0xTOKEN_ADDRESS 0xSERVER_ADDRESS
```

### 授予Admin角色

```bash
npx hardhat console --network baseSepolia

const PAYX = await ethers.getContractAt("PAYX", "0xTOKEN_ADDRESS");
const DEFAULT_ADMIN_ROLE = await PAYX.DEFAULT_ADMIN_ROLE();
await PAYX.grantRole(DEFAULT_ADMIN_ROLE, "0xNEW_ADMIN_ADDRESS");
```

### 检查角色

```bash
npx hardhat console --network baseSepolia

const PAYX = await ethers.getContractAt("PAYX", "0xTOKEN_ADDRESS");

// 检查MINTER_ROLE
const MINTER_ROLE = await PAYX.MINTER_ROLE();
const hasMinter = await PAYX.hasRole(MINTER_ROLE, "0xADDRESS");
console.log("Has Minter Role:", hasMinter);

// 检查DEFAULT_ADMIN_ROLE
const DEFAULT_ADMIN_ROLE = await PAYX.DEFAULT_ADMIN_ROLE();
const hasAdmin = await PAYX.hasRole(DEFAULT_ADMIN_ROLE, "0xADDRESS");
console.log("Has Admin Role:", hasAdmin);
```

### 撤销角色

```bash
npx hardhat console --network baseSepolia

const PAYX = await ethers.getContractAt("PAYX", "0xTOKEN_ADDRESS");

// 撤销MINTER_ROLE
const MINTER_ROLE = await PAYX.MINTER_ROLE();
await PAYX.revokeRole(MINTER_ROLE, "0xADDRESS");

// 撤销DEFAULT_ADMIN_ROLE
const DEFAULT_ADMIN_ROLE = await PAYX.DEFAULT_ADMIN_ROLE();
await PAYX.revokeRole(DEFAULT_ADMIN_ROLE, "0xADDRESS");
```

---

## Mint功能

### 单次Mint

**调用合约的 `mint()` 函数：**

```bash
npx hardhat console --network baseSepolia

const PAYX = await ethers.getContractAt("PAYX", "0xTOKEN_ADDRESS");

// Mint 10k PAYX to address
const to = "0xRECIPIENT_ADDRESS";
const txHash = ethers.keccak256(ethers.toUtf8Bytes("unique-tx-hash"));

const tx = await PAYX.mint(to, txHash);
await tx.wait();
console.log("Minted 10k PAYX to", to);
```

### 批量Mint

**调用合约的 `batchMint()` 函数：**

```bash
npx hardhat console --network baseSepolia

const PAYX = await ethers.getContractAt("PAYX", "0xTOKEN_ADDRESS");

// Batch mint to multiple addresses
const addresses = [
  "0xADDRESS1",
  "0xADDRESS2",
  "0xADDRESS3"
];

const txHashes = [
  ethers.keccak256(ethers.toUtf8Bytes("tx-hash-1")),
  ethers.keccak256(ethers.toUtf8Bytes("tx-hash-2")),
  ethers.keccak256(ethers.toUtf8Bytes("tx-hash-3"))
];

const tx = await PAYX.batchMint(addresses, txHashes);
await tx.wait();
console.log("Minted to", addresses.length, "addresses");
```

### Mint规则

- ✅ 每次mint固定数量（默认10,000 PAYX）
- ✅ 必须有MINTER_ROLE权限
- ✅ txHash必须唯一（防止重复mint）
- ✅ 不能超过MAX_MINT_COUNT
- ✅ 不能超过MAX_SUPPLY（2B）
- ⚡ 达到MAX_MINT_COUNT时自动部署流动性

### 检查是否已Mint

```bash
npx hardhat console --network baseSepolia

const PAYX = await ethers.getContractAt("PAYX", "0xTOKEN_ADDRESS");
const txHash = "0x123...";
const alreadyMinted = await PAYX.hasMinted(txHash);
console.log("Already minted:", alreadyMinted);
```

---

## 资金管理

### 1. 向合约转入USDC

**用于流动性部署的USDC准备：**

```bash
# 转入40k USDC（20/80配置所需）
TOKEN_CONTRACT_ADDRESS=0x... USDC_AMOUNT=40000 \
  npx hardhat run scripts/fundContract.js --network baseSepolia
```

**特性：**
- ✅ 检查sender余额
- ✅ 显示mint进度
- ✅ 计算还需多少USDC
- ⚠️ 可在任何时候调用

### 2. 从合约提取USDC

**方法A: 使用withdrawUSDC脚本（推荐）**

```bash
# 提取指定数量
TOKEN_CONTRACT_ADDRESS=0x... USDC_AMOUNT=1000 \
  npx hardhat run scripts/withdrawUSDC.js --network baseSepolia

# 提取全部
TOKEN_CONTRACT_ADDRESS=0x... USDC_AMOUNT=all \
  npx hardhat run scripts/withdrawUSDC.js --network baseSepolia

# 提取到指定地址
TOKEN_CONTRACT_ADDRESS=0x... \
USDC_AMOUNT=1000 \
RECIPIENT_ADDRESS=0x... \
  npx hardhat run scripts/withdrawUSDC.js --network baseSepolia
```

**方法B: 直接调用合约（高级）**

```bash
npx hardhat console --network baseSepolia

const PAYX = await ethers.getContractAt("PAYX", "0xTOKEN_ADDRESS");
const USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
const amount = ethers.parseUnits("1000", 6); // 1000 USDC

await PAYX.withdrawToken(USDC_ADDRESS, amount);
```

**权限要求：** DEFAULT_ADMIN_ROLE

### 3. 紧急提取（仅流动性部署前）

**一次性提取所有PAYX和USDC：**

```bash
TOKEN_CONTRACT_ADDRESS=0x... \
  npx hardhat run scripts/emergencyWithdraw.js --network baseSepolia
```

**限制：**
- ⚠️ 只能在流动性部署**前**使用
- ⚠️ 只能使用**一次**
- ⚠️ 需要DEFAULT_ADMIN_ROLE

**使用场景：**
- 部署后发现配置错误
- 需要重新部署
- 取消项目

---

## 流动性管理

### 自动部署流动性

**触发条件：** 当mintCount达到MAX_MINT_COUNT时自动触发

**自动发生的事情：**
1. 创建Uniswap v4 pool
2. 添加400M PAYX + 40k USDC流动性
3. 生成LP NFT（归属合约owner）
4. 设置初始价格为0.0001 USDC/PAYX

**无需手动操作！**

### 设置LP Guard Hook（可选）

在流动性部署前设置保护hook：

```bash
npx hardhat console --network baseSepolia

const PAYX = await ethers.getContractAt("PAYX", "0xTOKEN_ADDRESS");
const HOOK_ADDRESS = "0xYOUR_HOOK_ADDRESS";

await PAYX.setLpGuardHook(HOOK_ADDRESS);
```

**规则：**
- 只能设置一次
- 必须在流动性部署前
- 需要DEFAULT_ADMIN_ROLE

### 收集LP手续费

**从protocol-owned LP position收集交易手续费：**

```bash
npx hardhat console --network baseSepolia

const PAYX = await ethers.getContractAt("PAYX", "0xTOKEN_ADDRESS");
await PAYX.collectLpFees();
```

**手续费会发送到调用者地址**

**要求：**
- 流动性必须已部署
- 需要DEFAULT_ADMIN_ROLE

### 查询流动性状态

```bash
npx hardhat console --network baseSepolia

const PAYX = await ethers.getContractAt("PAYX", "0xTOKEN_ADDRESS");

const deployed = await PAYX.liquidityDeployed();
console.log("Liquidity Deployed:", deployed);

if (deployed) {
  const tokenId = await PAYX._lpTokenId();
  console.log("LP Token ID:", tokenId.toString());
}
```

---

## EIP-3009功能

PAYX支持EIP-3009 gasless transfers（元交易）。

### transferWithAuthorization

**允许用户签名授权他人转账，他人支付gas：**

```javascript
// 1. 用户离线签名
const domain = {
  name: "PAYX",
  version: "1",
  chainId: 84532, // Base Sepolia
  verifyingContract: PAYX_ADDRESS
};

const types = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" }
  ]
};

const value = {
  from: userAddress,
  to: recipientAddress,
  value: ethers.parseEther("1000"),
  validAfter: 0,
  validBefore: Math.floor(Date.now() / 1000) + 3600, // 1 hour
  nonce: ethers.randomBytes(32)
};

const signature = await userWallet.signTypedData(domain, types, value);
const sig = ethers.Signature.from(signature);

// 2. Relayer执行转账（支付gas）
await PAYX.transferWithAuthorization(
  value.from,
  value.to,
  value.value,
  value.validAfter,
  value.validBefore,
  value.nonce,
  sig.v,
  sig.r,
  sig.s
);
```

### receiveWithAuthorization

**类似transferWithAuthorization，但to必须是msg.sender（防止抢跑）：**

```javascript
// to必须是调用者自己
await PAYX.receiveWithAuthorization(
  from,
  msg.sender, // 必须是调用者
  value,
  validAfter,
  validBefore,
  nonce,
  v, r, s
);
```

### cancelAuthorization

**取消未使用的授权：**

```javascript
const nonce = ethers.randomBytes(32);
// 签名取消请求
const sig = await wallet.signTypedData(domain, cancelTypes, { authorizer, nonce });

await PAYX.cancelAuthorization(authorizer, nonce, v, r, s);
```

### 查询授权状态

```bash
npx hardhat console --network baseSepolia

const PAYX = await ethers.getContractAt("PAYX", "0xTOKEN_ADDRESS");
const nonce = "0x123...";
const used = await PAYX.authorizationState(userAddress, nonce);
console.log("Authorization used:", used);
```

---

## 查询功能

### 基本信息

```bash
npx hardhat console --network baseSepolia

const PAYX = await ethers.getContractAt("PAYX", "0xTOKEN_ADDRESS");

// Token信息
const name = await PAYX.name();
const symbol = await PAYX.symbol();
const decimals = await PAYX.decimals();
const totalSupply = await PAYX.totalSupply();

console.log(`${name} (${symbol})`);
console.log(`Decimals: ${decimals}`);
console.log(`Total Supply: ${ethers.formatEther(totalSupply)}`);
```

### Mint统计

```bash
const mintAmount = await PAYX.mintAmount();
const mintCount = await PAYX.mintCount();
const maxMintCount = await PAYX.maxMintCount();

console.log(`Mint Amount: ${ethers.formatEther(mintAmount)}`);
console.log(`Progress: ${mintCount} / ${maxMintCount}`);
console.log(`Percentage: ${Number(mintCount) * 100 / Number(maxMintCount)}%`);
```

### Supply信息

```bash
const maxSupply = await PAYX.maxSupply();
const remainingSupply = await PAYX.remainingSupply();

console.log(`Max Supply: ${ethers.formatEther(maxSupply)}`);
console.log(`Remaining: ${ethers.formatEther(remainingSupply)}`);
```

### 流动性信息

```bash
const paymentSeed = await PAYX.paymentSeed();
const liquidityDeployed = await PAYX.liquidityDeployed();

console.log(`Required USDC for LP: ${ethers.formatUnits(paymentSeed, 6)}`);
console.log(`Liquidity Deployed: ${liquidityDeployed}`);
```

### 余额查询

```bash
// PAYX余额
const balance = await PAYX.balanceOf("0xADDRESS");
console.log(`PAYX Balance: ${ethers.formatEther(balance)}`);

// 合约USDC余额
const USDC = await ethers.getContractAt(
  "IERC20",
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
);
const usdcBalance = await USDC.balanceOf(PAYX.address);
console.log(`Contract USDC: ${ethers.formatUnits(usdcBalance, 6)}`);
```

### 完整状态检查

**使用checkPAYX脚本：**

```bash
TOKEN_CONTRACT_ADDRESS=0x... \
  npx hardhat run scripts/checkPAYX.js --network baseSepolia
```

---

## 常见问题

### Q1: 如何修改tokenomics配置？

编辑 `scripts/deployPAYX.js`：

```javascript
const MINT_AMOUNT = hre.ethers.parseEther("10000");    // 每次mint数量
const MAX_MINT_COUNT = 160000;                         // 最大mint次数
const POOL_SEED_AMOUNT = hre.ethers.parseEther("400000000");  // LP代币数
const PAYMENT_SEED = hre.ethers.parseUnits("40000", 6);      // LP USDC数
```

**注意：** 修改后需要重新部署合约！

---

### Q2: 如何支持多个minter？

```bash
# 给多个地址授予MINTER_ROLE
TOKEN_CONTRACT_ADDRESS=0x... SERVER_ADDRESS=0xADDRESS1 \
  npx hardhat run scripts/grantRole.js --network baseSepolia

TOKEN_CONTRACT_ADDRESS=0x... SERVER_ADDRESS=0xADDRESS2 \
  npx hardhat run scripts/grantRole.js --network baseSepolia
```

每个minter都可以独立调用mint函数。

---

### Q3: 流动性部署失败怎么办？

**可能原因：**
1. 合约USDC不足
2. Pool已存在
3. Hook配置错误

**检查：**
```bash
npx hardhat console --network baseSepolia

const PAYX = await ethers.getContractAt("PAYX", "0xTOKEN_ADDRESS");
const USDC = await ethers.getContractAt("IERC20", "0x036Cb...");

const paymentSeed = await PAYX.paymentSeed();
const usdcBalance = await USDC.balanceOf(PAYX.address);

console.log("Required:", ethers.formatUnits(paymentSeed, 6));
console.log("Actual:", ethers.formatUnits(usdcBalance, 6));
```

**解决：**
```bash
# 转入不足的USDC
TOKEN_CONTRACT_ADDRESS=0x... USDC_AMOUNT=40000 \
  npx hardhat run scripts/fundContract.js --network baseSepolia
```

---

### Q4: 如何在流动性部署前取回资金？

**使用emergencyWithdraw：**

```bash
TOKEN_CONTRACT_ADDRESS=0x... \
  npx hardhat run scripts/emergencyWithdraw.js --network baseSepolia
```

这会提取所有PAYX和USDC到admin地址。

⚠️ **只能在流动性部署前使用，且只能用一次！**

---

### Q5: 如何更换admin？

```bash
npx hardhat console --network baseSepolia

const PAYX = await ethers.getContractAt("PAYX", "0xTOKEN_ADDRESS");
const DEFAULT_ADMIN_ROLE = await PAYX.DEFAULT_ADMIN_ROLE();

// 1. 授予新admin
await PAYX.grantRole(DEFAULT_ADMIN_ROLE, "0xNEW_ADMIN");

// 2. (可选) 撤销旧admin
await PAYX.revokeRole(DEFAULT_ADMIN_ROLE, "0xOLD_ADMIN");
```

---

### Q6: 如何验证合约？

```bash
npx hardhat verify --network baseSepolia \
  0xCONTRACT_ADDRESS \
  "PAYX" \
  "PAYX" \
  "10000000000000000000000" \
  "160000" \
  "0x7da1d65f8b249183667cde74c5cbd46dd38aa829" \
  "0xc01ee65a5087409013202db5e1f77e3b74579abf" \
  "0x000000000022d473030f116ddee9f6b43ac78ba3" \
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e" \
  "40000000000" \
  "400000000000000000000000000" \
  "3961408125713216879041820949" \
  "792281625142643375935439503360"
```

或者部署时会自动验证（如果配置了API key）。

---

### Q7: 如何监控合约事件？

```bash
npx hardhat console --network baseSepolia

const PAYX = await ethers.getContractAt("PAYX", "0xTOKEN_ADDRESS");

// 监听TokensMinted事件
PAYX.on("TokensMinted", (to, amount, txHash) => {
  console.log(`Minted ${ethers.formatEther(amount)} to ${to}`);
  console.log(`TX Hash: ${txHash}`);
});

// 监听LiquidityDeployed事件
PAYX.on("LiquidityDeployed", (tokenId, liquidity) => {
  console.log(`Liquidity deployed! Token ID: ${tokenId}`);
  console.log(`Liquidity: ${liquidity}`);
});
```

---

### Q8: 合约可以升级吗？

**不可以。** PAYX是不可升级合约，部署后immutable。

如果需要修改配置，必须重新部署新合约。

---

### Q9: 如何处理mint进度监控？

**创建监控脚本：**

```javascript
// scripts/monitorMint.js
const hre = require("hardhat");

async function main() {
  const PAYX = await hre.ethers.getContractAt("PAYX", process.env.TOKEN_CONTRACT_ADDRESS);
  
  const mintCount = await PAYX.mintCount();
  const maxMintCount = await PAYX.maxMintCount();
  const progress = Number(mintCount) * 100 / Number(maxMintCount);
  
  console.log(`Progress: ${mintCount} / ${maxMintCount} (${progress.toFixed(2)}%)`);
  
  if (progress >= 90) {
    console.log("⚠️  WARNING: Approaching max mint count!");
    console.log("   Make sure contract has sufficient USDC for LP deployment");
  }
}

setInterval(main, 60000); // 每分钟检查
```

---

## 脚本速查表

| 脚本 | 用途 | 示例 |
|------|------|------|
| `deployPAYX.js` | 部署合约 | `npx hardhat run scripts/deployPAYX.js --network baseSepolia` |
| `deployAndMintPAYX.js` | 部署并测试mint | `npx hardhat run scripts/deployAndMintPAYX.js --network baseSepolia` |
| `grantRole.js` | 授予角色 | `TOKEN_CONTRACT_ADDRESS=0x... SERVER_ADDRESS=0x... npx hardhat run scripts/grantRole.js --network baseSepolia` |
| `checkPAYX.js` | 检查状态 | `TOKEN_CONTRACT_ADDRESS=0x... npx hardhat run scripts/checkPAYX.js --network baseSepolia` |
| `fundContract.js` | 转入USDC | `TOKEN_CONTRACT_ADDRESS=0x... USDC_AMOUNT=40000 npx hardhat run scripts/fundContract.js --network baseSepolia` |
| `withdrawUSDC.js` | 提取USDC | `TOKEN_CONTRACT_ADDRESS=0x... USDC_AMOUNT=1000 npx hardhat run scripts/withdrawUSDC.js --network baseSepolia` |
| `emergencyWithdraw.js` | 紧急提取 | `TOKEN_CONTRACT_ADDRESS=0x... npx hardhat run scripts/emergencyWithdraw.js --network baseSepolia` |

---

## 相关文档

- **[TOKENOMICS.md](./TOKENOMICS.md)** - 代币经济学详解（20/80分配模型）
- **[PAYX.sol](./contracts/PAYX.sol)** - 合约源代码
- **[README.md](../README.md)** - 项目总览

---

## 支持

遇到问题？
1. 查看 [常见问题](#常见问题)
2. 检查 `scripts/checkPAYX.js` 输出
3. 查看合约事件日志
4. 联系开发团队

---

**最后更新：** 2025-01-27

