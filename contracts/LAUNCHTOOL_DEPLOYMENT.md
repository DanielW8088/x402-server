# LaunchTool 部署指南

LaunchTool 是一个共享的 Uniswap V3 池子创建和流动性管理工具。部署一次后，可以为多个 X402Token 创建独立的流动性池。

## 📋 前置要求

- ✅ 已安装 Node.js 和 npm
- ✅ 已安装项目依赖 (`npm install`)
- ✅ 有部署者账户的私钥（将成为 LaunchTool admin）
- ✅ 账户有足够的 ETH 支付 gas 费用

## 🚀 快速部署

### 1. 配置环境变量

```bash
# 必需：设置部署者私钥（该地址将自动成为 LaunchTool admin）
export DEPLOYER_PRIVATE_KEY=0x...
```

**重要**: 从 `DEPLOYER_PRIVATE_KEY` 派生的地址将：
- 自动成为 LaunchTool 的 admin
- 可以调用 `configurePoolByAmount()` 创建池子
- 可以调用 `withdrawToken()` 提取代币
- 可以调用 `changeAdmin()` 转移管理权

**注意**: 脚本会自动从私钥获取地址，无需手动设置 `LAUNCH_TOOL_ADMIN`

### 2. 部署到 Base 主网

```bash
npx hardhat run scripts/deployLaunchTool.js --network base
```

### 3. 部署到 Base Sepolia 测试网

```bash
npx hardhat run scripts/deployLaunchTool.js --network baseSepolia
```

## 📤 部署输出

成功部署后，你会看到：

```
============================================================
🚀 Deploying LaunchTool
============================================================
Network: base (Chain ID: 8453)
Deployer (will be admin): 0xf7a66e2749152cc77f9F56a679EE7A1A9F5806aF
Uniswap V3 Factory: 0x33128a8fC17869897dcE68Ed026d694621f6FDfD
Uniswap V3 Position Manager: 0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1
============================================================

📦 Compiling contracts...
📤 Deploying contract...
✅ LaunchTool deployed to: 0x1234567890abcdef1234567890abcdef12345678

⏳ Waiting for 3 block confirmations...
✅ Deployment confirmed in block: 12345678

============================================================
🎉 DEPLOYMENT COMPLETE!
============================================================
LaunchTool Address: 0x1234567890abcdef1234567890abcdef12345678
Admin: 0xf7a66e2749152cc77f9F56a679EE7A1A9F5806aF
Network: base
============================================================

📝 Next steps:
1. Save the LaunchTool address: 0x1234567890abcdef1234567890abcdef12345678
2. Use it as LAUNCH_TOOL_ADDRESS in LP deployment
3. Verify contract on block explorer (optional):
   npx hardhat verify --network base 0x1234567890abcdef... ...
```

## 💾 保存部署信息

**重要**: 保存输出的 LaunchTool 地址，后续所有 token 的 LP 部署都需要用到。

建议保存到 `.env` 文件：

```bash
# .env
LAUNCH_TOOL_ADDRESS=0x1234567890abcdef1234567890abcdef12345678
# Admin 地址就是你的 DEPLOYER_PRIVATE_KEY 对应的地址
```

## 🔍 验证部署

### 方法 1: 使用区块浏览器

访问 BaseScan 查看合约：
- **Base 主网**: https://basescan.org/address/0x...
- **Base Sepolia**: https://sepolia.basescan.org/address/0x...

检查：
- ✅ 合约代码已部署
- ✅ Admin 地址正确
- ✅ Factory 和 Position Manager 地址正确

### 方法 2: 使用 Hardhat Console

```bash
npx hardhat console --network base

# 在 console 中：
> const LaunchTool = await ethers.getContractFactory("LaunchTool")
> const launchTool = LaunchTool.attach("0x...")  // 你的 LaunchTool 地址
> await launchTool.admin()
'0xf7a66e2749152cc77f9F56a679EE7A1A9F5806aF'  // 应该匹配你的 admin 地址
```

## 🔐 验证合约源码（可选）

在区块浏览器上验证合约源码，让所有人都能查看：

```bash
# Base 主网
npx hardhat verify --network base \
  <LAUNCH_TOOL_ADDRESS> \
  "0x33128a8fC17869897dcE68Ed026d694621f6FDfD" \
  "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1" \
  "<YOUR_DEPLOYER_ADDRESS>"

# Base Sepolia
npx hardhat verify --network baseSepolia \
  <LAUNCH_TOOL_ADDRESS> \
  "0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24" \
  "0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2" \
  "<YOUR_DEPLOYER_ADDRESS>"
```

替换 `<LAUNCH_TOOL_ADDRESS>` 和 `<YOUR_DEPLOYER_ADDRESS>` 为实际值。

## 📊 合约配置

### LaunchTool 构造函数参数

```solidity
constructor(
    address _uniswapV3Factory,      // Uniswap V3 工厂合约
    address _positionManager,       // Uniswap V3 Position Manager
    address _admin                  // LaunchTool 管理员
)
```

### 网络地址配置

#### Base 主网 (Chain ID: 8453)
```
Uniswap V3 Factory:      0x33128a8fC17869897dcE68Ed026d694621f6FDfD
Position Manager:        0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1
```

#### Base Sepolia (Chain ID: 84532)
```
Uniswap V3 Factory:      0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24
Position Manager:        0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2
```

## 🎯 使用 LaunchTool

部署完成后，你可以：

### 1. 为单个 Token 创建 LP

```bash
TOKEN_ADDRESS=0x... \
LAUNCH_TOOL_ADDRESS=0x... \
TARGET_PRICE_USDC=0.5 \
  npx hardhat run scripts/deployFullLiquidityFlow.js --network base
```

### 2. 为多个 Token 创建 LP

```bash
# Token A
TOKEN_ADDRESS=0xAAA... LAUNCH_TOOL_ADDRESS=0x... TARGET_PRICE_USDC=0.5 \
  npx hardhat run scripts/deployFullLiquidityFlow.js --network base

# Token B
TOKEN_ADDRESS=0xBBB... LAUNCH_TOOL_ADDRESS=0x... TARGET_PRICE_USDC=1.0 \
  npx hardhat run scripts/deployFullLiquidityFlow.js --network base

# Token C
TOKEN_ADDRESS=0xCCC... LAUNCH_TOOL_ADDRESS=0x... TARGET_PRICE_USDC=0.1 \
  npx hardhat run scripts/deployFullLiquidityFlow.js --network base
```

每个 token 都会获得独立的 Uniswap V3 池子。

## ⚙️ LaunchTool 管理功能

### 查看当前 Admin

```javascript
// Hardhat console
const launchTool = await ethers.getContractAt("LaunchTool", "0x...");
await launchTool.admin();
```

### 转移 Admin 权限

```javascript
// 只有当前 admin 可以调用
await launchTool.changeAdmin("0xNewAdminAddress...");
```

### 提取代币（清理剩余余额）

```javascript
// 提取某个 token 的余额
await launchTool.withdrawToken("0xTokenAddress...", amount);
```

## ❌ 常见问题

### 问题 1: "Could not get deployer address"

**原因**: `DEPLOYER_PRIVATE_KEY` 未设置或格式错误

**解决**:
```bash
# 确保 .env 文件中有 DEPLOYER_PRIVATE_KEY
echo "DEPLOYER_PRIVATE_KEY=0x..." >> .env

# 或者临时设置
export DEPLOYER_PRIVATE_KEY=0x...
```

### 问题 2: "Unsupported chain ID"

**原因**: 网络不支持

**解决**: 只支持 Base (8453) 和 Base Sepolia (84532)，使用正确的 `--network` 参数

### 问题 3: "insufficient funds for gas"

**原因**: 部署账户 ETH 不足

**解决**: 向部署账户转入足够的 ETH（建议 0.01 ETH 以上）

## 🔒 安全注意事项

### Admin 账户管理

1. **使用硬件钱包**: 部署账户应使用硬件钱包或多签钱包（因为它会成为 admin）
2. **私钥安全**: 永不泄露 `DEPLOYER_PRIVATE_KEY`
3. **权限验证**: 部署后立即验证 admin 地址正确（应该是你的部署地址）
4. **及时转移**: 如果使用临时账户部署，尽快调用 `changeAdmin()` 转移到安全账户

### 环境变量安全

```bash
# ❌ 不要这样做
git add .env

# ✅ 确保 .gitignore 包含
echo ".env" >> .gitignore
```

### 部署检查清单

部署前确认：
- [ ] `DEPLOYER_PRIVATE_KEY` 已设置（在 `.env` 文件中）
- [ ] 部署账户有足够 ETH
- [ ] 已在测试网测试过
- [ ] `.env` 文件已加入 `.gitignore`

部署后确认：
- [ ] 合约地址已保存
- [ ] Admin 地址正确（应该是部署者地址）
- [ ] Factory 和 Position Manager 地址正确
- [ ] 合约已验证（可选）

## 📈 Gas 费用估算

| 网络 | 预估 Gas | 预估费用 (ETH) |
|------|----------|----------------|
| Base 主网 | ~1,500,000 | ~0.0015 (at 1 gwei) |
| Base Sepolia | ~1,500,000 | 免费测试网 |

实际费用取决于网络拥堵情况。Base 的 gas 费用通常很低。

## 🔄 更新 LaunchTool

如果需要更新 LaunchTool 合约：

1. **部署新版本**: 按照本指南重新部署
2. **更新环境变量**: 更新 `LAUNCH_TOOL_ADDRESS`
3. **迁移数据**: 
   - 旧版本的池子不受影响（已在 Uniswap 上）
   - 新 token 使用新的 LaunchTool 地址
4. **清理旧合约**: 使用 `withdrawToken()` 提取旧合约中的余额

## 📚 相关文档

- [LP_QUICK_START.md](./LP_QUICK_START.md) - LP 部署快速指南
- [LP_DEPLOYMENT_GUIDE.md](./LP_DEPLOYMENT_GUIDE.md) - LP 部署详细文档
- [contracts/LaunchTool.sol](./contracts/LaunchTool.sol) - 合约源码

## 🆘 获取帮助

遇到问题？

1. 检查部署输出的错误信息
2. 查看区块浏览器上的交易详情
3. 在测试网先测试
4. 检查环境变量配置

## 📝 示例：完整部署流程

```bash
# 1. 准备环境
cd contracts
npm install

# 2. 配置环境变量（在 .env 文件中）
# DEPLOYER_PRIVATE_KEY=0x...

# 3. 先在测试网部署
npx hardhat run scripts/deployLaunchTool.js --network baseSepolia

# 输出: LaunchTool deployed to: 0x123...
# 保存地址: export LAUNCH_TOOL_ADDRESS=0x123...

# 4. 验证测试网部署
npx hardhat console --network baseSepolia
# > const launchTool = await ethers.getContractAt("LaunchTool", "0x123...")
# >await launchTool.admin()

# 5. 测试网测试成功后，部署到主网
npx hardhat run scripts/deployLaunchTool.js --network base

# 输出: LaunchTool deployed to: 0xABC...
# 保存地址: export LAUNCH_TOOL_ADDRESS=0xABC...

# 6. 验证主网合约（可选）
# 注意：YOUR_DEPLOYER_ADDRESS 就是你的 DEPLOYER_PRIVATE_KEY 对应的地址
npx hardhat verify --network base \
  0xABC... \
  "0x33128a8fC17869897dcE68Ed026d694621f6FDfD" \
  "0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1" \
  "0xYourDeployerAddress..."

# 7. 保存到 .env
echo "LAUNCH_TOOL_ADDRESS=0xABC..." >> .env

# 8. 现在可以使用 LaunchTool 部署 LP 了！
TOKEN_ADDRESS=0x... \
LAUNCH_TOOL_ADDRESS=$LAUNCH_TOOL_ADDRESS \
TARGET_PRICE_USDC=0.5 \
  npx hardhat run scripts/deployFullLiquidityFlow.js --network base
```
 
## ✅ 部署成功标志

部署成功后，你应该：

1. ✅ 获得 LaunchTool 合约地址
2. ✅ 在区块浏览器上能看到合约
3. ✅ `admin()` 返回正确的地址
4. ✅ 已保存 LaunchTool 地址到 `.env`
5. ✅ 可以开始为 token 部署 LP

恭喜！LaunchTool 部署完成，现在可以为无限个 token 创建流动性池了！🎉

## License

MIT

