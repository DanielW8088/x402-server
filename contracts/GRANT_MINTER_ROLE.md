# 授予 MINTER_ROLE 权限

部署合约后，需要给后端服务的钱包授予 MINTER_ROLE，否则 mint 操作会失败。

## 🔑 关键概念

- **DEPLOYER_PRIVATE_KEY** - 部署合约的钱包，拥有 DEFAULT_ADMIN_ROLE
- **SERVER_PRIVATE_KEY** - 后端服务使用的钱包，需要 MINTER_ROLE 才能 mint

## 📋 步骤

### 1. 确保 .env 配置正确

```bash
cd contracts
```

编辑 `.env` 文件，确保包含：

```bash
# 部署者私钥（拥有 admin 权限）
DEPLOYER_PRIVATE_KEY=0x...

# 服务器私钥（需要授予 minter 权限）
SERVER_PRIVATE_KEY=0x...
```

### 2. 检查当前权限状态

```bash
TOKEN_ADDRESS=0xYourTokenAddress npx hardhat run scripts/checkMinterRole.js --network base
```

输出示例：
```
🔍 Checking MINTER_ROLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Token Contract: 0x123...
Server Address: 0xABC...

✅ Role Check Results:
Has MINTER_ROLE: ❌ NO
Has DEFAULT_ADMIN_ROLE: ❌ NO
```

### 3. 授予 MINTER_ROLE

```bash
TOKEN_ADDRESS=0xYourTokenAddress npx hardhat run scripts/grantMinterRole.js --network base
```

输出示例：
```
🔐 Granting MINTER_ROLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Token Contract: 0x123...
Server Address: 0xABC...
Deployer: 0xDEF...

⏳ Granting role...
Transaction hash: 0x789...
✅ Role granted successfully!

🔍 Verification:
Has MINTER_ROLE: ✅ YES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### 4. 验证权限

再次运行检查命令确认：

```bash
TOKEN_ADDRESS=0xYourTokenAddress npx hardhat run scripts/checkMinterRole.js --network base
```

应该看到：
```
Has MINTER_ROLE: ✅ YES
```

## 🚨 常见错误

### 错误 1: Transaction reverted

```
❌ Batch processing error: Transaction reverted: 0x...
```

**原因**: SERVER_PRIVATE_KEY 对应的地址没有 MINTER_ROLE

**解决**: 运行上述步骤授予权限

### 错误 2: Only admin can grant roles

**原因**: 当前使用的 DEPLOYER_PRIVATE_KEY 不是合约的 admin

**解决**: 使用部署合约时用的私钥

### 错误 3: SERVER_PRIVATE_KEY not found

**原因**: `.env` 文件中没有设置 SERVER_PRIVATE_KEY

**解决**: 在 `contracts/.env` 中添加 SERVER_PRIVATE_KEY

## 🎯 快速命令参考

```bash
# 检查权限
TOKEN_ADDRESS=0x... npx hardhat run scripts/checkMinterRole.js --network base

# 授予权限
TOKEN_ADDRESS=0x... npx hardhat run scripts/grantMinterRole.js --network base

# Base Sepolia 测试网
TOKEN_ADDRESS=0x... npx hardhat run scripts/checkMinterRole.js --network baseSepolia
TOKEN_ADDRESS=0x... npx hardhat run scripts/grantMinterRole.js --network baseSepolia
```

## 📝 注意事项

1. ✅ 确保 DEPLOYER_PRIVATE_KEY 账户有足够的 ETH 支付 gas
2. ✅ SERVER_PRIVATE_KEY 和后端 server/.env 中的必须一致
3. ✅ 每个新部署的合约都需要重新授予 MINTER_ROLE
4. ✅ 授权操作需要 gas fee（约 0.0001 ETH）

## 🔄 完整部署流程

```bash
# 1. 部署合约
cd contracts
npx hardhat run scripts/deployToken.js --network base

# 2. 记录合约地址（从输出中获取）
TOKEN_ADDRESS=0x...

# 3. 授予 MINTER_ROLE
TOKEN_ADDRESS=$TOKEN_ADDRESS npx hardhat run scripts/grantMinterRole.js --network base

# 4. 更新后端配置
cd ../server
# 编辑 .env，添加 TOKEN_ADDRESS

# 5. 重启后端服务
npm run build
pm2 restart all
```

