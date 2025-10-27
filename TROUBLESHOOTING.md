# 故障排除指南

## 常见错误及解决方案

### 1. "replacement transaction underpriced"

**错误信息：**
```
replacement transaction underpriced
```

**原因：**
- 有一个相同 nonce 的交易正在 pending
- 新交易的 gas 价格太低，无法替换旧交易

**解决方案：**

```bash
# 1. 检查 pending 交易
cd server
npm run check

# 2. 等待 30-60 秒让 pending 交易完成

# 3. 如果还是有 pending，查看 Basescan
# https://sepolia.basescan.org/address/YOUR_ADDRESS

# 4. 重试客户端
cd ../client
npm start
```

**已修复：**
- ✅ 服务器现在自动添加 20% gas 价格缓冲
- ✅ 更好的错误提示

---

### 2. "Address undefined is invalid"

**错误信息：**
```
Error: Address "undefined" is invalid
```

**原因：**
- 服务器 `/info` 端点缺少 `payTo` 字段

**解决方案：**

```bash
# 1. 确保服务器是最新版本
cd server
git pull  # 或重新下载

# 2. 重启服务器
npm start

# 3. 验证 payTo 存在
curl http://localhost:4021/info | grep payTo
```

**已修复：**
- ✅ `/info` 端点现在返回 `payTo` 字段

---

### 3. "Insufficient USDC balance"

**错误信息：**
```
Insufficient USDC balance. You have 0 USDC but need 1 USDC
```

**解决方案：**

**Base Sepolia 测试网：**
```bash
# 1. 获取 ETH
# https://portal.cdp.coinbase.com/products/faucet

# 2. 在 Uniswap 上 swap ETH -> USDC
# https://app.uniswap.org

# USDC 地址: 0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

---

### 4. "Transaction pending"

**错误信息：**
```
A transaction is already pending. Please wait a moment and try again.
```

**解决方案：**

```bash
# 1. 检查 pending 状态
cd server
npm run check

# 2. 查看输出
📊 Account Status:
   Current Nonce: 7
   Pending Nonce: 8  # ← 如果这个大于 Current，说明有 pending
   
# 3. 等待 1-2 分钟

# 4. 再次检查
npm run check

# 5. 确认无 pending 后重试
✅ No pending transactions
```

---

### 5. 服务器无法启动

**错误信息：**
```
Error: listen EADDRINUSE: address already in use :::4021
```

**解决方案：**

```bash
# 停止占用端口的进程
lsof -ti:4021 | xargs kill -9

# 重新启动
npm start
```

---

### 6. "Missing MINTER_ROLE"

**错误信息：**
```
AccessControl: account 0x... is missing role 0x...
```

**解决方案：**

```bash
# 1. 确认服务器地址
cd server
npm run address

# 2. 授予 MINTER_ROLE
cd ../contracts
# 在 .env 中配置
echo "SERVER_ADDRESS=0xYourServerAddress" >> .env
echo "TOKEN_CONTRACT_ADDRESS=0xYourTokenAddress" >> .env

# 3. 运行授权脚本
npm run grant:minter

# 4. 重试 mint
cd ../client
npm start
```

---

### 7. 客户端连接失败

**错误信息：**
```
Error: connect ECONNREFUSED 127.0.0.1:4021
```

**解决方案：**

```bash
# 1. 检查服务器是否运行
curl http://localhost:4021/health

# 2. 如果失败，启动服务器
cd server
npm start

# 3. 验证
curl http://localhost:4021/health
# 应该返回: {"status":"ok",...}
```

---

### 8. Gas 不足

**错误信息：**
```
insufficient funds for gas * price + value
```

**解决方案：**

```bash
# 1. 检查服务器 ETH 余额
cd server
npm run check

📊 Account Status:
   ETH Balance: 0.000001 ETH  # ← 太低！

# 2. 发送 ETH 到服务器地址
# 至少发送 0.001 ETH

# 3. 再次检查
npm run check
```

---

### 9. 网络配置错误

**错误信息：**
```
Error: Chain mismatch
```

**解决方案：**

确保服务器和客户端使用相同的网络：

**server/.env:**
```bash
NETWORK=base-sepolia
```

**client/.env:**
```bash
NETWORK=base-sepolia
```

---

### 10. USDC 合约地址错误

**错误信息：**
```
Contract not found
```

**解决方案：**

使用正确的 USDC 地址：

**Base Sepolia:**
```bash
USDC_CONTRACT_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

**Base Mainnet:**
```bash
USDC_CONTRACT_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

---

## 调试工具

### 检查服务器状态

```bash
cd server
npm run check
```

输出示例：
```
🔍 Checking pending transactions...
Network: base-sepolia
Address: 0x130777E1166C89A9CD539f6E8eE86F5C615BCff7

📊 Account Status:
   Current Nonce: 7
   Pending Nonce: 7
   ETH Balance: 0.000569 ETH

✅ No pending transactions
   You can submit new transactions now.

⛽ Current Gas Price: 0.00 gwei
```

### 查看服务器地址

```bash
cd server
npm run address
```

### 测试服务器 API

```bash
# Health check
curl http://localhost:4021/health

# Get info
curl http://localhost:4021/info

# 测试 mint（需要有效的交易哈希）
curl -X POST http://localhost:4021/mint \
  -H "Content-Type: application/json" \
  -d '{
    "paymentTxHash": "0x...",
    "payer": "0x..."
  }'
```

---

## 完整诊断流程

遇到问题时，按以下顺序检查：

### 1. 检查服务器

```bash
cd server

# 检查是否运行
curl http://localhost:4021/health

# 检查配置
cat .env | grep -v "^#" | grep -v "^$"

# 检查 pending 交易
npm run check

# 查看服务器地址
npm run address
```

### 2. 检查客户端

```bash
cd client

# 检查配置
cat .env | grep -v "^#" | grep -v "^$"

# 验证私钥格式（应该以 0x 开头）
cat .env | grep PRIVATE_KEY
```

### 3. 检查合约

```bash
cd contracts

# 检查配置
cat .env | grep -v "^#" | grep -v "^$"

# 验证 MINTER_ROLE（如果部署了合约）
npm run check:status
```

### 4. 检查区块链状态

```bash
# Base Sepolia Explorer
https://sepolia.basescan.org/address/YOUR_ADDRESS

# 查看：
# - ETH 余额
# - USDC 余额
# - 最近的交易
# - Pending 交易
```

---

## 预防措施

### 1. 测试前检查清单

- [ ] 服务器已启动 (`curl http://localhost:4021/health`)
- [ ] 服务器地址有 MINTER_ROLE
- [ ] 服务器地址有足够 ETH (>0.001 ETH)
- [ ] 客户端地址有足够 USDC (>=1 USDC)
- [ ] 客户端地址有足够 ETH (>0.001 ETH)
- [ ] 没有 pending 交易 (`npm run check`)
- [ ] 网络配置正确（服务器和客户端一致）

### 2. 最佳实践

1. **小额测试**：先测试最小金额
2. **等待确认**：每次交易后等待 1-2 分钟
3. **检查余额**：操作前检查 ETH 和 USDC 余额
4. **保存日志**：记录交易哈希以便追踪
5. **使用测试网**：正式部署前充分测试

### 3. 紧急情况

如果遇到无法解决的问题：

```bash
# 1. 停止所有服务
lsof -ti:4021 | xargs kill -9

# 2. 清理并重新安装
cd server
rm -rf node_modules package-lock.json
npm install

cd ../client
rm -rf node_modules package-lock.json
npm install

# 3. 重新配置
cd ../server
cp .env.example .env
# 编辑 .env

cd ../client
cp .env.example .env
# 编辑 .env

# 4. 重新启动
cd ../server
npm start

# 在新终端
cd ../client
npm start
```

---

## 获取帮助

如果以上都无法解决问题：

1. **查看完整错误**：复制完整的错误信息
2. **检查文档**：阅读 README.md 和 USAGE.md
3. **查看日志**：检查服务器和客户端的完整日志
4. **区块链浏览器**：在 Basescan 上验证交易状态
5. **提交 Issue**：包含错误信息、环境配置和复现步骤

---

## 常用链接

- [Base Sepolia Faucet](https://portal.cdp.coinbase.com/products/faucet)
- [Base Sepolia Explorer](https://sepolia.basescan.org)
- [Uniswap](https://app.uniswap.org)
- [Viem Docs](https://viem.sh)
- [Base Docs](https://docs.base.org)

