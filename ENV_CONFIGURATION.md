# 环境变量配置指南

所有目录的 `.env` 配置说明。

---

## 📁 contracts/.env

部署合约时需要的环境变量：

```bash
# ==================== 必需配置 ====================

# 部署者私钥（用于部署合约和支付gas）
DEPLOYER_PRIVATE_KEY=0x你的私钥

# ==================== 可选配置 ====================

# Basescan API Key（用于自动验证合约）
BASESCAN_API_KEY=你的API_Key

# Base Sepolia RPC（使用默认值即可）
BASE_SEPOLIA_RPC=https://sepolia.base.org

# Base Mainnet RPC（使用默认值即可）
BASE_RPC=https://mainnet.base.org

# ==================== 授权脚本使用 ====================

# Token合约地址（部署后填写，用于授权脚本）
TOKEN_CONTRACT_ADDRESS=0x合约地址

# 服务器地址（需要授予MINTER_ROLE）
SERVER_ADDRESS=0x服务器地址
```

### 创建文件
```bash
cd contracts
cat > .env << 'EOF'
DEPLOYER_PRIVATE_KEY=0x你的私钥
BASESCAN_API_KEY=你的API_Key
EOF
```

### 注意事项
- ✅ DEPLOYER 需要有 ETH 支付 gas
- ✅ 部署 X402Token 时，DEPLOYER 需要有 100k USDC（用于LP）
- ⚠️ 永远不要提交 `.env` 到 git

---

## 📁 server/.env

x402支付服务器配置：

```bash
# ==================== 必需配置 ====================

# x402 Facilitator服务URL
FACILITATOR_URL=https://x402.org/facilitator

# 接收USDC支付的地址
PAY_TO_ADDRESS=0x你的地址

# 服务器私钥（需要有MINTER_ROLE）
SERVER_PRIVATE_KEY=0x你的私钥

# Token合约地址
TOKEN_CONTRACT_ADDRESS=0x合约地址

# 区块链网络
NETWORK=base-sepolia

# ==================== 可选配置 ====================

# 服务器端口（默认4021）
PORT=4021
```

### 创建文件
```bash
cd server
cat > .env << 'EOF'
FACILITATOR_URL=https://x402.org/facilitator
PAY_TO_ADDRESS=0x你的地址
SERVER_PRIVATE_KEY=0x你的私钥
TOKEN_CONTRACT_ADDRESS=0x合约地址
NETWORK=base-sepolia
PORT=4021
EOF
```

### 注意事项
- ✅ SERVER_PRIVATE_KEY 对应的地址必须有 MINTER_ROLE
- ✅ SERVER 地址需要有少量 ETH 用于 mint 交易的 gas
- ✅ PAY_TO_ADDRESS 可以与 SERVER 地址不同
- ✅ 确保 NETWORK 与合约部署的网络一致

### 授权步骤

部署合约后，授权服务器地址：

```bash
cd contracts
export TOKEN_CONTRACT_ADDRESS=0x合约地址
export SERVER_ADDRESS=0x服务器地址
npm run grant:sepolia
```

验证授权：
```bash
npm run status:sepolia
```

---

## 📁 client/.env

测试客户端配置：

```bash
# ==================== 必需配置 ====================

# 服务器URL
SERVER_URL=http://localhost:4021

# 客户端私钥（用于支付）
PRIVATE_KEY=0x你的私钥

# x402 Facilitator服务URL
FACILITATOR_URL=https://x402.org/facilitator
```

### 创建文件
```bash
cd client
cat > .env << 'EOF'
SERVER_URL=http://localhost:4021
PRIVATE_KEY=0x你的私钥
FACILITATOR_URL=https://x402.org/facilitator
EOF
```

### 注意事项
- ✅ PRIVATE_KEY 对应的地址需要有 USDC
- ✅ 第一次使用需要 approve USDC（自动处理）
- ✅ 需要少量 ETH 用于 approve 交易

---

## 🎯 完整配置流程

### 1️⃣ 准备阶段

**获取测试币**（Base Sepolia）:
- ETH: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
- USDC: https://faucet.circle.com/

**准备账户**:
```
部署者账户: ETH (gas) + 100k USDC (LP)
服务器账户: ETH (gas)
客户端账户: USDC (支付) + ETH (approve)
```

### 2️⃣ 配置contracts

```bash
cd contracts
cat > .env << 'EOF'
DEPLOYER_PRIVATE_KEY=0xabc123...
BASESCAN_API_KEY=ABCD1234...
EOF
```

### 3️⃣ 部署合约

```bash
npm install
npm run deploy:x402:sepolia
```

记录输出的合约地址，例如: `0x1234567890abcdef...`

### 4️⃣ 配置server

```bash
cd ../server
cat > .env << 'EOF'
FACILITATOR_URL=https://x402.org/facilitator
PAY_TO_ADDRESS=0x你的收款地址
SERVER_PRIVATE_KEY=0xdef456...
TOKEN_CONTRACT_ADDRESS=0x1234567890abcdef...
NETWORK=base-sepolia
PORT=4021
EOF
```

### 5️⃣ 授权服务器

```bash
cd ../contracts
export TOKEN_CONTRACT_ADDRESS=0x1234567890abcdef...
export SERVER_ADDRESS=0x服务器对应的地址
npm run grant:sepolia

# 验证
npm run status:sepolia
```

### 6️⃣ 启动服务器

```bash
cd ../server
npm install
npm run dev
```

服务器运行在 http://localhost:4021

### 7️⃣ 配置client

```bash
cd ../client
cat > .env << 'EOF'
SERVER_URL=http://localhost:4021
PRIVATE_KEY=0xghi789...
FACILITATOR_URL=https://x402.org/facilitator
EOF
```

### 8️⃣ 测试

```bash
npm install
npm start
```

---

## 🔐 安全最佳实践

### ✅ 推荐做法

1. **不同账户分离**
```
部署者账户: 用于部署，部署后可以不再使用
服务器账户: 用于mint，长期使用
收款账户: 用于接收USDC，可以是冷钱包
```

2. **最小权限原则**
```
服务器账户: 只需要 MINTER_ROLE，不需要 DEFAULT_ADMIN_ROLE
部署者账户: 部署后转移 DEFAULT_ADMIN_ROLE 给安全账户
```

3. **环境变量管理**
```bash
# 使用环境变量管理工具
# 例如: direnv, dotenv-vault

# 或使用密钥管理服务
# 例如: AWS Secrets Manager, HashiCorp Vault
```

4. **备份私钥**
```
- 物理备份（纸质）
- 加密备份（密码管理器）
- 多个安全位置存储
```

### ❌ 避免做法

1. ❌ 不要在代码中硬编码私钥
2. ❌ 不要提交 `.env` 文件到 git
3. ❌ 不要在公共场所展示私钥
4. ❌ 不要使用同一私钥在测试网和主网
5. ❌ 不要分享包含私钥的截图

---

## 🌐 网络配置

### Base Sepolia (测试网)

```bash
NETWORK=base-sepolia
```

**参数**:
- Chain ID: 84532
- RPC: https://sepolia.base.org
- Explorer: https://sepolia.basescan.org
- USDC: 0x036CbD53842c5426634e7929541eC2318f3dCF7e

**获取测试币**:
- ETH Faucet: https://www.coinbase.com/faucets/base-ethereum-sepolia-faucet
- USDC Faucet: https://faucet.circle.com/

### Base (主网)

```bash
NETWORK=base
```

**参数**:
- Chain ID: 8453
- RPC: https://mainnet.base.org
- Explorer: https://basescan.org
- USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

**注意**: 主网使用真实资金，请谨慎！

---

## 📊 配置检查清单

### 部署前检查

- [ ] 所有 `.env` 文件已创建
- [ ] 私钥已正确填写
- [ ] 部署者有足够 ETH 和 USDC
- [ ] Uniswap v4 地址已在 `deployX402Token.js` 中配置
- [ ] 代币名称和参数已自定义
- [ ] 测试网测试成功

### 部署后检查

- [ ] 合约地址已记录
- [ ] 合约已在区块浏览器上验证
- [ ] 服务器地址已被授予 MINTER_ROLE
- [ ] `server/.env` 中的 TOKEN_CONTRACT_ADDRESS 已更新
- [ ] 100k USDC 已转到合约（用于LP）
- [ ] 服务器成功启动
- [ ] 端到端测试成功

---

## 🆘 故障排除

### "Missing DEPLOYER_PRIVATE_KEY"
```bash
# 检查 .env 文件是否存在
ls -la contracts/.env

# 检查内容
cat contracts/.env

# 重新创建
cd contracts
echo "DEPLOYER_PRIVATE_KEY=0x你的私钥" > .env
```

### "SERVER地址没有MINTER_ROLE"
```bash
cd contracts
export TOKEN_CONTRACT_ADDRESS=0x合约地址
export SERVER_ADDRESS=0x服务器地址
npm run grant:sepolia

# 验证
npm run status:sepolia
```

### "Insufficient funds for gas"
```bash
# 检查账户余额
# 需要有 ETH 支付 gas
```

### "Insufficient USDC"
```bash
# 部署 X402Token 需要 100k USDC
# 检查部署者账户 USDC 余额
```

---

## 📝 配置模板

### 快速复制模板

**contracts/.env**:
```bash
DEPLOYER_PRIVATE_KEY=0x
BASESCAN_API_KEY=
```

**server/.env**:
```bash
FACILITATOR_URL=https://x402.org/facilitator
PAY_TO_ADDRESS=0x
SERVER_PRIVATE_KEY=0x
TOKEN_CONTRACT_ADDRESS=0x
NETWORK=base-sepolia
PORT=4021
```

**client/.env**:
```bash
SERVER_URL=http://localhost:4021
PRIVATE_KEY=0x
FACILITATOR_URL=https://x402.org/facilitator
```

---

## 🎓 示例配置

### 完整示例（Base Sepolia测试网）

```bash
# ============ contracts/.env ============
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
BASESCAN_API_KEY=ABC123XYZ456

# ============ server/.env ============
FACILITATOR_URL=https://x402.org/facilitator
PAY_TO_ADDRESS=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
SERVER_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
TOKEN_CONTRACT_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
NETWORK=base-sepolia
PORT=4021

# ============ client/.env ============
SERVER_URL=http://localhost:4021
PRIVATE_KEY=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
FACILITATOR_URL=https://x402.org/facilitator
```

⚠️ **警告**: 上面的私钥是公开的测试私钥，**永远不要用于主网！**

---

## 📚 相关文档

- [X402_FULL_GUIDE.md](./X402_FULL_GUIDE.md) - 完整使用指南
- [X402_SUMMARY.md](./X402_SUMMARY.md) - 快速开始
- [COMPARISON.md](./COMPARISON.md) - 合约对比

---

## 💡 提示

创建 `.env` 文件的最简单方法：

```bash
# contracts
cd contracts
echo 'DEPLOYER_PRIVATE_KEY=0x你的私钥' > .env

# server  
cd ../server
cat > .env << 'EOF'
FACILITATOR_URL=https://x402.org/facilitator
PAY_TO_ADDRESS=0x你的地址
SERVER_PRIVATE_KEY=0x你的私钥
TOKEN_CONTRACT_ADDRESS=0x合约地址
NETWORK=base-sepolia
PORT=4021
EOF

# client
cd ../client
cat > .env << 'EOF'
SERVER_URL=http://localhost:4021
PRIVATE_KEY=0x你的私钥
FACILITATOR_URL=https://x402.org/facilitator
EOF
```

祝配置顺利！🚀

