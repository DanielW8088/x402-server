# 自动授予 MINTER_ROLE

部署新 token 时，后端会自动将 MINTER_ROLE 授予 SERVER_PRIVATE_KEY 对应的地址。

## 🎯 工作原理

当用户通过 API 部署新 token 时：

1. **读取配置** - 从环境变量读取 `SERVER_PRIVATE_KEY`
2. **推导地址** - 从私钥推导出服务器地址
3. **部署合约** - 使用 `DEPLOYER_PRIVATE_KEY` 部署合约
4. **自动授权** - 部署成功后，自动将 MINTER_ROLE 授予服务器地址
5. **验证权限** - 验证权限授予成功

## ✅ 优势

- **自动化** - 无需手动运行授权脚本
- **安全** - 部署和授权在同一交易流程中完成
- **可靠** - 验证步骤确保授权成功，失败会抛出错误

## 📋 环境变量要求

确保 `server/.env` 文件包含：

```bash
# 部署者私钥（用于部署合约和授予权限）
# 这个地址会被授予 DEFAULT_ADMIN_ROLE
DEPLOYER_PRIVATE_KEY=0x...

# 服务器私钥（用于 mint 操作）
# 这个地址会自动被授予 MINTER_ROLE
SERVER_PRIVATE_KEY=0x...

# LP 部署者私钥（用于部署流动性）
LP_DEPLOYER_PRIVATE_KEY=0x...
```

## 🔄 部署流程

### 通过 API 部署

```bash
POST /api/deploy
{
  "name": "MyToken",
  "symbol": "MTK",
  "mintAmount": "10000",
  "maxMintCount": 100,
  "price": "1",
  "paymentToken": "USDC",
  "network": "base",
  "deployer": "0x...",
  "imageUrl": "https://...",
  "description": "..."
}
```

**响应示例：**

```json
{
  "success": true,
  "token": {
    "address": "0x123...",
    "name": "MyToken",
    "symbol": "MTK",
    "txHash": "0xabc...",
    "blockNumber": 12345678
  }
}
```

### 后台日志

```
💼 LP Deployer: 0xf7a...aF
🔐 Server address (will be granted MINTER_ROLE): 0xABC...123

Deploying X402Token: MyToken
LP Deployer: 0xf7a...aF
Server Address: 0xABC...123
Token deployed to: 0x123...DEF
Deployment confirmed in block: 12345678

🔐 Granting MINTER_ROLE to server...
Grant role tx: 0x789...XYZ
✅ MINTER_ROLE granted to server
```

## 🔍 验证权限

可以通过以下方式验证权限：

### 1. 通过 Hardhat 脚本

```bash
cd contracts
TOKEN_ADDRESS=0x... npx hardhat run scripts/checkMinterRole.js --network base
```

### 2. 通过区块链浏览器

访问 [BaseScan](https://basescan.org) 查看合约的 `hasRole` 函数调用。

### 3. 通过 API

```bash
GET /api/token/0x.../info
```

## ⚠️ 注意事项

1. **私钥安全**
   - 不要将 `.env` 文件提交到 git
   - 确保 `DEPLOYER_PRIVATE_KEY` 有足够的 ETH 支付 gas
   - `SERVER_PRIVATE_KEY` 只需要用于读取地址，不需要 ETH

2. **权限关系**
   - `DEPLOYER_PRIVATE_KEY` → DEFAULT_ADMIN_ROLE（部署时自动获得）
   - `SERVER_PRIVATE_KEY` → MINTER_ROLE（部署后自动授予）
   - `LP_DEPLOYER_PRIVATE_KEY` → 接收 LP 资产（配置时指定）

3. **Gas 费用**
   - 部署合约: ~0.001-0.003 ETH
   - 授予权限: ~0.0001 ETH
   - 总计: ~0.0015-0.0035 ETH

## 🚨 错误处理

### 错误 1: SERVER_PRIVATE_KEY 未设置

```
❌ Error: SERVER_PRIVATE_KEY environment variable required
```

**解决**: 在 `server/.env` 中添加 `SERVER_PRIVATE_KEY`

### 错误 2: 授权失败

```
❌ Error: Failed to grant MINTER_ROLE
```

**原因**: 
- DEPLOYER_PRIVATE_KEY 没有 ETH
- 网络连接问题

**解决**: 
- 检查 deployer 账户余额
- 检查网络连接

### 错误 3: 验证失败

```
❌ Error: Failed to grant MINTER_ROLE
```

**原因**: 权限授予交易 revert

**解决**: 
- 检查部署日志
- 验证 deployer 是否有 DEFAULT_ADMIN_ROLE

## 📚 相关文档

- [GRANT_MINTER_ROLE.md](../../contracts/GRANT_MINTER_ROLE.md) - 手动授予权限的方法
- [contracts/scripts/grantMinterRole.js](../../contracts/scripts/grantMinterRole.js) - 授权脚本
- [contracts/scripts/checkMinterRole.js](../../contracts/scripts/checkMinterRole.js) - 检查权限脚本

