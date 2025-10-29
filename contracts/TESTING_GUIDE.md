# 🧪 池子测试指南

## ✅ 部署成功信息

```
Pool Address: 0xCFEB5A4ed2c4cbc1615B32CFf626dD48b5D2d23f
Token Address: 0xd9ddeff0205d3e8ad03b1a0d4016a18f6b470252
USDC Address: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
Network: Base Sepolia
Current Tick: 92108
LP Live: ✅ true
```

## 📝 快速测试命令

### 1. 查看池子信息

```bash
cd contracts

POOL_ADDRESS=0xCFEB5A4ed2c4cbc1615B32CFf626dD48b5D2d23f \
npx hardhat run scripts/testPool.js --network baseSepolia
```

**预期输出：**
```
🔍 Pool Information:
  Token0: 0x036CbD53842c5426634e7929541eC2318f3dCF7e (USDC)
  Token1: 0xd9ddeff0205d3e8ad03b1a0d4016a18f6b470252 (Your Token)
  Fee Tier: 10000 (1%)
  Liquidity: [流动性数量]
  Current Tick: 92108

💰 Current Price:
  1 USDC = 10000.000000 Token
  1 Token = 0.000100 USDC
```

### 2. 测试交易报价

```bash
# 测试用 1 USDC 买 Token
POOL_ADDRESS=0xCFEB5A4ed2c4cbc1615B32CFf626dD48b5D2d23f \
AMOUNT_IN=1 \
npx hardhat run scripts/testSwap.js --network baseSepolia
```

### 3. 查看 Token 状态

```bash
TOKEN_ADDRESS=0xd9ddeff0205d3e8ad03b1a0d4016a18f6b470252 \
npx hardhat run scripts/checkTokenLpStatus.js --network baseSepolia
```

## 🌐 区块浏览器链接

### Base Sepolia

**Pool 合约:**
```
https://sepolia.basescan.org/address/0xCFEB5A4ed2c4cbc1615B32CFf626dD48b5D2d23f
```

**Token 合约:**
```
https://sepolia.basescan.org/address/0xd9ddeff0205d3e8ad03b1a0d4016a18f6b470252
```

**USDC 合约:**
```
https://sepolia.basescan.org/address/0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

**查看交易：**
- Pool 创建交易: https://sepolia.basescan.org/tx/0xa840d6ac45c447403561b51f4510400458a83af57eaecb33b482226ce8b3ea15
- LP Live 确认: https://sepolia.basescan.org/tx/0x18e07b509a634f377c33542ff3219440b3f86b7cdd0d7030df4393a1b3a61bb9

## 💱 Uniswap 界面测试

### 在 Uniswap 上交易

1. 访问 Uniswap:
   ```
   https://app.uniswap.org/#/swap?chain=base_sepolia
   ```

2. 连接钱包（确保在 Base Sepolia 网络）

3. 导入你的 Token:
   - 点击 "Select token"
   - 粘贴地址: `0xd9ddeff0205d3e8ad03b1a0d4016a18f6b470252`
   - 确认导入

4. 尝试交易:
   - 从 USDC 买入 Token
   - 或从 Token 卖出换 USDC

## 🔍 验证检查清单

### ✅ 基础验证

- [ ] Pool 地址存在且可访问
- [ ] Token0/Token1 地址正确
- [ ] Fee tier 为 1% (10000)
- [ ] 流动性大于 0
- [ ] Current tick 在合理范围内（约 92108）

### ✅ Token 状态验证

```bash
# 检查 LP Live 状态
cast call 0xd9ddeff0205d3e8ad03b1a0d4016a18f6b470252 "lpLive()(bool)" \
  --rpc-url https://sepolia.base.org
# 应返回: true

# 检查 assetsTransferred
cast call 0xd9ddeff0205d3e8ad03b1a0d4016a18f6b470252 "assetsTransferred()(bool)" \
  --rpc-url https://sepolia.base.org
# 应返回: true

# 检查 launchTool 地址
cast call 0xd9ddeff0205d3e8ad03b1a0d4016a18f6b470252 "launchTool()(address)" \
  --rpc-url https://sepolia.base.org
# 应返回: 0x91cAfe77F5266FEa14f6db43Bb73BeF6ba80c609
```

### ✅ 流动性验证

```bash
# 检查池子余额
# Token 余额
cast call 0xd9ddeff0205d3e8ad03b1a0d4016a18f6b470252 \
  "balanceOf(address)(uint256)" \
  0xCFEB5A4ed2c4cbc1615B32CFf626dD48b5D2d23f \
  --rpc-url https://sepolia.base.org

# USDC 余额
cast call 0x036CbD53842c5426634e7929541eC2318f3dCF7e \
  "balanceOf(address)(uint256)" \
  0xCFEB5A4ed2c4cbc1615B32CFf626dD48b5D2d23f \
  --rpc-url https://sepolia.base.org
```

## 📊 性能测试

### 1. 小额交易测试
```bash
# 测试 0.1 USDC 换 Token
POOL_ADDRESS=0xCFEB5A4ed2c4cbc1615B32CFf626dD48b5D2d23f \
AMOUNT_IN=0.1 \
npx hardhat run scripts/testSwap.js --network baseSepolia
```

### 2. 中等交易测试
```bash
# 测试 1 USDC 换 Token
POOL_ADDRESS=0xCFEB5A4ed2c4cbc1615B32CFf626dD48b5D2d23f \
AMOUNT_IN=1 \
npx hardhat run scripts/testSwap.js --network baseSepolia
```

### 3. 大额交易测试
```bash
# 测试 10 USDC 换 Token（可能会有较高滑点）
POOL_ADDRESS=0xCFEB5A4ed2c4cbc1615B32CFf626dD48b5D2d23f \
AMOUNT_IN=10 \
npx hardhat run scripts/testSwap.js --network baseSepolia
```

## 🎯 预期结果

### 价格验证
根据初始设置：
- **1 Token = 0.0001 USDC**
- **1 USDC = 10,000 Token**

实际价格可能略有不同，因为：
- Tick 是离散的（每个 tick 约 0.01% 价格变化）
- 交易会产生滑点
- 流动性分布影响

### 流动性验证
初始流动性：
- **USDC**: ~2.5 USDC (2,500,000 单位，6位小数)
- **Token**: ~25,000 Token (25,000,000,000 单位，6位小数)

## 🐛 故障排查

### 问题：testSwap 报错 "insufficient liquidity"
**原因**: 流动性不足或价格影响太大  
**解决**: 减少 AMOUNT_IN 数量

### 问题：Uniswap 界面找不到 Token
**原因**: Token 未导入  
**解决**: 
1. 点击 "Select token"
2. 粘贴地址并导入
3. 确认风险提示

### 问题：交易失败 "TransfersLocked"
**原因**: LP 未正确标记为 live  
**解决**: 
```bash
# 检查状态
cast call $TOKEN "lpLive()(bool)" --rpc-url https://sepolia.base.org

# 如果是 false，需要调用 confirmLpLive
TOKEN_ADDRESS=0xd9ddeff0205d3e8ad03b1a0d4016a18f6b470252 \
npx hardhat run scripts/confirmLpLive.js --network baseSepolia
```

## 📱 前端集成测试

如果你有前端应用（0x402.io）：

1. **Token 应该显示为 "LP Live"**
   - 检查 TokenList 组件
   - 应该显示绿色 "LP Live" 标签

2. **用户应该能自由转账**
   - LP live 后不再有转账限制
   - 用户可以互相转账

3. **Mint 应该仍然工作**
   - 如果还有剩余 mint 额度

## 🎉 成功标准

全部通过表示部署完全成功：

- [x] Pool 合约已创建
- [x] 初始流动性已添加
- [x] LP Live 已确认
- [x] Token 转账限制已解除
- [x] 价格在预期范围内
- [x] 可以通过 Quoter 获取报价
- [x] 可以在 Uniswap 界面交易

## 📚 下一步

1. **监控池子活动**
   - 观察交易量
   - 检查价格变动
   - 监控流动性变化

2. **添加更多流动性**（可选）
   - 通过 Uniswap 界面
   - 或通过 Position Manager

3. **更新前端**
   - 添加 Uniswap 交易链接
   - 显示实时价格
   - 集成 swap widget

4. **部署到主网**（Base）
   - 重复相同流程
   - 使用真实 USDC
   - 更大的流动性

恭喜！你的 Token 现在已经有流动性并可以交易了！🚀

