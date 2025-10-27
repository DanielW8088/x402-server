# 当前状态和使用说明

## ✅ 系统状态

### Server（服务器）
- ✅ 编译成功
- ✅ 运行正常（端口 4021）
- ✅ 有 MINTER_ROLE
- ✅ 有 DEFAULT_ADMIN_ROLE
- ✅ API 端点正常
- ✅ 错误处理完善
- ⚠️  ETH 余额：0.000569 ETH（可能需要更多）

### Client（客户端）
- ✅ 编译成功
- ✅ 配置正确
- ✅ 超时设置已优化（90秒）
- ✅ 错误处理完善

### Contract（合约）
- ✅ 已部署：`0x1009ca37fD2237249B5c9592e7979d62Bdc89706`
- ✅ 权限配置正确

## 📋 完整工作流程

### 1. 启动服务器

```bash
cd server
npm start
```

**验证：**
```bash
curl http://localhost:4021/health
# 应该返回: {"status":"ok",...}

# 检查权限
npm run check:role
# 应该显示: ✅ Server address HAS MINTER_ROLE

# 检查 pending 交易
npm run check
# 应该显示: ✅ No pending transactions
```

### 2. 准备客户端

确保你的钱包有：
- ✅ 至少 1 USDC
- ✅ 至少 0.001 ETH（用于 gas）

**检查余额：**
```bash
# 在 Basescan 上查看
https://sepolia.basescan.org/address/YOUR_ADDRESS

# 或使用 cast
cast balance --erc20 0x036CbD53842c5426634e7929541eC2318f3dCF7e YOUR_ADDRESS
```

### 3. 运行客户端

```bash
cd client
npm start
```

**预期流程：**
```
🚀 Token Mint Client
====================

📋 Step 1: Getting server info...
   ✅ Token contract, Pay to address, etc.

💰 Step 2: Sending 1 USDC payment...
   ✅ USDC transfer confirmed

🎨 Step 3: Minting tokens...
   ⏳ Waiting for confirmation (最多 60 秒)
   ✅ Tokens minted successfully!
```

## 🔍 故障排除

### 问题 1：客户端卡在 "Requesting token mint"

**原因：** 交易确认时间太长

**解决：**
1. 等待 1-2 分钟
2. 查看服务器日志：`tail -f /tmp/server-new.log`
3. 如果超时，交易可能仍在处理
4. 在 Basescan 上检查交易状态

### 问题 2："Transaction could not be found"

**原因：** 支付交易没有 USDC Transfer 事件

**解决：**
- 确保发送的是 USDC（不是 ETH）
- 确保 USDC 合约地址正确
- 确保发送到正确的地址（`payTo`）

### 问题 3："replacement transaction underpriced"

**原因：** 有 pending 交易

**解决：**
```bash
cd server
npm run check
# 等待 pending 完成，然后重试
```

### 问题 4：服务器 ETH 不足

**原因：** 需要 ETH 支付 mint 交易的 gas

**解决：**
```bash
# 发送至少 0.01 ETH 到服务器地址
# 服务器地址：0x130777E1166C89A9CD539f6E8eE86F5C615BCff7
```

## 🧪 测试工具

### 1. 检查服务器状态
```bash
cd server
npm run check
```

### 2. 检查权限
```bash
cd server
npm run check:role
```

### 3. 测试 API
```bash
cd server
./testMint.sh
```

### 4. 手动测试 Mint

如果客户端失败，可以手动测试：

```bash
# 1. 手动发送 USDC
# 使用 MetaMask 或其他钱包
# 发送 1 USDC 到: 0x130777e1166c89a9cd539f6e8ee86f5c615bcff7
# 记录交易哈希

# 2. 手动调用 mint API
curl -X POST http://localhost:4021/mint \
  -H "Content-Type: application/json" \
  -d '{
    "paymentTxHash": "0xYourActualUSDCTransactionHash",
    "payer": "0xYourAddress"
  }'
```

## 📊 监控

### 实时监控服务器日志
```bash
tail -f /tmp/server-new.log
```

### 查看交易状态
```bash
# Base Sepolia Explorer
https://sepolia.basescan.org/tx/YOUR_TX_HASH
```

### 检查代币余额
```bash
# 在合约上调用 balanceOf
cast call 0x1009ca37fD2237249B5c9592e7979d62Bdc89706 \
  "balanceOf(address)(uint256)" \
  YOUR_ADDRESS \
  --rpc-url https://sepolia.base.org
```

## ⚙️ 配置检查清单

### Server (.env)
- [x] `SERVER_PRIVATE_KEY` - 已配置
- [x] `TOKEN_CONTRACT_ADDRESS` - 0x1009ca37fD2237249B5c9592e7979d62Bdc89706
- [x] `PAY_TO_ADDRESS` - 0x130777e1166c89a9cd539f6e8ee86f5c615bcff7
- [x] `USDC_CONTRACT_ADDRESS` - 0x036CbD53842c5426634e7929541eC2318f3dCF7e
- [x] `NETWORK` - base-sepolia
- [x] `REQUIRED_PAYMENT_USDC` - 1

### Client (.env)
- [x] `PRIVATE_KEY` - 已配置
- [x] `SERVER_URL` - http://localhost:4021
- [x] `USDC_CONTRACT_ADDRESS` - 0x036CbD53842c5426634e7929541eC2318f3dCF7e
- [x] `NETWORK` - base-sepolia
- [x] `PAYMENT_AMOUNT_USDC` - 1

## 🎯 成功的 Mint 流程

一个成功的 mint 应该是这样的：

### 客户端输出：
```
🚀 Token Mint Client
Network: base-sepolia
Your address: 0x130777E1166C89A9CD539f6E8eE86F5C615BCff7

📋 Step 1: Getting server info...
   Token contract: 0x1009ca37fD2237249B5c9592e7979d62Bdc89706
   Pay to address: 0x130777e1166c89a9cd539f6e8ee86f5c615bcff7

💰 Step 2: Sending 1 USDC payment...
   Your USDC balance: 2 USDC
   Transaction hash: 0xabc123...
   ✅ USDC transfer confirmed at block 12345

🎨 Step 3: Minting tokens...
   This may take up to 60 seconds...

✨ SUCCESS! Tokens minted!
============================
Payer: 0x130777E1166C89A9CD539f6E8eE86F5C615BCff7
Amount: 10000 tokens
Payment TX: 0xabc123...
Mint TX: 0xdef456...

🎉 All done!
```

### 服务器输出：
```
⛽ Gas price: 100000000 (buffered: 120000000)
🎨 Minting to 0x130777E1166C89A9CD539f6E8eE86F5C615BCff7...
✅ Mint transaction sent: 0xdef456...
   View on Basescan: https://sepolia.basescan.org/tx/0xdef456...
⏳ Waiting for confirmation...
✅ Transaction confirmed in block 12346
```

## 🐛 常见问题

### Q: 为什么交易这么慢？

**A:** Base Sepolia 测试网有时会比较慢。通常：
- USDC 转账：5-30 秒
- Mint 交易：10-60 秒

### Q: 我可以同时运行多个 mint 吗？

**A:** 不建议。等第一个完成后再开始第二个，避免 nonce 冲突。

### Q: 如果超时了怎么办？

**A:** 交易可能仍在处理。等待 2-3 分钟，然后：
1. 在 Basescan 上检查交易状态
2. 运行 `npm run check` 查看 pending 状态
3. 如果交易成功了，再次运行客户端会显示 "Already minted"

### Q: 可以 mint 多次吗？

**A:** 可以！每次支付 1 USDC 就可以 mint 一次。只要：
- 有足够的 USDC
- 代币供应量没有达到上限
- 每次使用不同的交易

## 📚 相关文档

- [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) - 详细故障排除
- [server/README.md](./server/README.md) - 服务器文档
- [client/README.md](./client/README.md) - 客户端文档
- [client/USAGE.md](./client/USAGE.md) - 使用指南
- [QUICK_START.md](./QUICK_START.md) - 快速开始

## 💡 优化建议

### 1. 增加服务器 ETH

当前余额：0.000569 ETH（约 6 笔交易）

**建议：** 发送 0.01 ETH 到服务器地址

### 2. 监控工具

考虑添加：
- 日志聚合（如 Winston）
- 监控告警（ETH/USDC 余额低）
- 交易队列（处理并发请求）

### 3. 数据库

考虑使用数据库持久化：
- 已处理的交易
- Mint 记录
- 错误日志

## 🎉 准备就绪

系统已经完全配置好，可以使用了！

**快速测试：**
```bash
# Terminal 1 - 启动服务器
cd server && npm start

# Terminal 2 - 运行客户端
cd client && npm start
```

祝 Mint 愉快！🚀

