# PAYX Tokenomics - 20/80 分配模型

## 供应量分配

```
总供应量: 2,000,000,000 PAYX (2B)
════════════════════════════════════════

LP Pool (协议流动性):  400,000,000 (20%)
User Mints (社区):    1,600,000,000 (80%)
════════════════════════════════════════
```

## 详细配置

### 用户Mint部分 (80%)

- **总量**: 1,600,000,000 PAYX
- **每次Mint**: 10,000 PAYX
- **最大次数**: 160,000 次
- **支付要求**: 每次支付 1 USDC

**计算:**
```
1,600,000,000 ÷ 10,000 = 160,000 mints
160,000 × 1 USDC = $160,000 总收入
```

### LP Pool部分 (20%)

- **总量**: 400,000,000 PAYX
- **配对USDC**: 40,000 USDC
- **初始价格**: 0.0001 USDC/PAYX
- **时机**: 在第160,000次mint时自动部署到Uniswap v4

**LP配置:**
```
400M PAYX : 40k USDC
Ratio: 10,000 PAYX = 1 USDC
Initial Market Cap: $200,000
```

## 部署流程

### 1. 部署合约

```bash
cd contracts
npx hardhat run scripts/deployPAYX.js --network baseSepolia
```

部署时自动发生：
- ✅ 预mint 400M PAYX 到合约地址
- ✅ 设置MAX_MINT_COUNT = 160,000
- ✅ 设置每次mint = 10,000 PAYX

### 2. 转入USDC到合约

**重要：** 必须在达到160,000次mint前转入40,000 USDC！

```bash
# 方法1: 使用hardhat console
npx hardhat console --network baseSepolia

const USDC = await ethers.getContractAt(
  "IERC20", 
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
);
const PAYX_ADDRESS = "YOUR_CONTRACT_ADDRESS";
await USDC.transfer(PAYX_ADDRESS, ethers.parseUnits("40000", 6));

# 方法2: 直接从钱包转账
# 转账 40,000 USDC 到合约地址
```

### 3. 授予Minter角色

```bash
npx hardhat run scripts/grantRole.js --network baseSepolia \
  TOKEN_CONTRACT_ADDRESS=<contract-address> \
  SERVER_ADDRESS=<your-server-address>
```

### 4. 启动Mint流程

服务器开始接收用户支付，每次mint 10k PAYX。

### 5. 自动部署流动性

当第160,000次mint完成时：
- ✅ 自动创建Uniswap v4池子
- ✅ 添加 400M PAYX + 40k USDC 流动性
- ✅ LP NFT归属合约owner

## 价格计算

### 初始价格
```
Price = 40,000 USDC ÷ 400,000,000 PAYX
      = 0.0001 USDC per PAYX
      = $0.0001 per token
```

### 初始市值
```
Market Cap = 2B tokens × $0.0001
           = $200,000
```

### LP深度
```
40k USDC 流动性
≈ $40,000 买盘深度
≈ 20% 的总市值
```

## 用户获得比例

每个用户：
- 支付 1 USDC
- 获得 10,000 PAYX
- 占总供应量: 0.0005% (10k / 2B)

如果全部mint完：
- 总共160,000个地址
- 平均每地址: 10,000 PAYX
- 社区占比: 80%

## 收入分配

### 总收入
```
160,000 mints × 1 USDC = $160,000
```

### 用途建议
1. **40,000 USDC** → LP池子 (25%)
2. **120,000 USDC** → 项目运营/开发 (75%)
   - 服务器运维
   - 营销推广
   - 团队激励
   - 进一步开发

## 优势

### ✅ 对社区友好
- 80%由社区持有
- 公平分配机制
- 无预挖无内幕

### ✅ 充足流动性
- 40k USDC深度
- 初始滑点低
- 价格相对稳定

### ✅ 激励对齐
- 早期支持者获得更多代币
- 项目有资金持续运营
- LP自动部署，减少人为操控

## 对比其他模型

### 50/50 模型 (原始配置)
```
LP: 1B (50%)  →  过多，项目方控制太强
User: 1B (50%) →  社区占比不足
USDC: 100k     →  流动性过深，资金浪费
```

### 20/80 模型 (当前)
```
LP: 400M (20%)  →  合理，足够流动性
User: 1.6B (80%) →  社区主导
USDC: 40k       →  高效利用资金
```

### 10/90 模型 (激进)
```
LP: 200M (10%)  →  流动性不足
User: 1.8B (90%) →  过度去中心化
USDC: 20k       →  价格波动大
```

## 风险控制

### 1. USDC不足风险

**问题:** 如果达到160k mint时，合约USDC < 40k

**解决:**
- 部署后立即转入USDC
- 或者在mint进度50%时转入
- 使用 `emergencyWithdraw()` 提前取出token

### 2. 流动性过早耗尽

**问题:** 40k USDC可能不够深度

**解决:**
- 社区自发添加流动性
- 用收入的一部分再添加LP
- 启用交易费用回流机制

### 3. 价格操纵

**问题:** 早期持有者集中抛售

**解决:**
- 每次mint限制10k，分散持有
- LP锁定在合约，减少砸盘风险
- 社区治理决定后续LP管理

## 监控命令

### 查看当前状态
```bash
npx hardhat run scripts/checkPAYX.js --network baseSepolia
```

### 检查USDC余额
```bash
npx hardhat console --network baseSepolia

const USDC = await ethers.getContractAt(
  "IERC20",
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
);
const balance = await USDC.balanceOf("YOUR_PAYX_ADDRESS");
console.log("USDC:", ethers.formatUnits(balance, 6));
```

### 查看mint进度
```bash
const PAYX = await ethers.getContractAt("PAYX", "YOUR_PAYX_ADDRESS");
const current = await PAYX.mintCount();
const max = await PAYX.maxMintCount();
console.log(`Progress: ${current} / ${max} (${current * 100n / max}%)`);
```

## 总结

**20/80 模型是最平衡的选择：**

- ✅ 社区占主导 (80%)
- ✅ 流动性充足 (40k USDC)
- ✅ 资金高效利用
- ✅ 价格相对稳定
- ✅ 符合去中心化理念

**记住：在第160,000次mint前，必须确保合约有40,000 USDC！**

