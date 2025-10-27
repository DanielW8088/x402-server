# 快速开始 - 简化LP部署系统

## 🚀 5分钟上手

### 1. 生成LP部署地址

```bash
# 生成新私钥
node -e "console.log('0x' + require('crypto').randomBytes(32).toString('hex'))"
# 输出: 0x...
```

或使用现有钱包地址的私钥。

### 2. 配置环境变量

编辑 `server/.env`：

```bash
# 必需配置
DATABASE_URL=postgresql://user:password@localhost:5432/token_mint
SERVER_PRIVATE_KEY=0x...                # 服务器私钥（用于mint）
LP_DEPLOYER_PRIVATE_KEY=0x...           # LP部署私钥（新增！）

# 可选配置
NETWORK=base-sepolia                     # 或 'base'
EXCESS_RECIPIENT_ADDRESS=0x...          # 接收多余USDC
```

### 3. 确保LP部署地址有ETH

```bash
# LP部署地址需要ETH支付gas
# Base Sepolia: 至少0.01 ETH
# Base Mainnet: 至少0.01 ETH

# 可以从水龙头获取测试币：
# https://www.coinbase.com/faucets/base-ethereum-goerli-faucet
```

### 4. 运行数据库迁移

```bash
cd server
psql $DATABASE_URL -f db/migrate-to-simple.sql
```

### 5. 启动服务器

```bash
cd server
npm run dev:multi-token
```

应该看到：

```
💼 LP Deployer Address: 0x...
🚀 Multi-Token x402 Server running on port 3002
Network: base-sepolia
LP Monitor: ✅ Enabled (Simplified, check every 15s)
```

### 6. 部署Token

```bash
curl -X POST http://localhost:3002/api/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Token",
    "symbol": "TEST",
    "mintAmount": "1000",
    "maxMintCount": 10,
    "price": "1",
    "paymentToken": "USDC",
    "deployer": "0x你的地址"
  }'
```

返回：

```json
{
  "address": "0x...",
  "name": "Test Token",
  "symbol": "TEST",
  "deployer": "0x...",
  "lpDeployer": "0x..."  // LP部署地址
}
```

### 7. 发送USDC到合约

```bash
# 计算需要的USDC
# = maxMintCount * price
# 例如: 10 * 1 = 10 USDC

# 发送到合约地址
```

### 8. 完成Mints

```bash
# 用户通过前端或API mint
# 每次mint后，mintCount增加
```

### 9. 自动LP部署

当所有mints完成后（mintCount = maxMintCount），系统自动：

1. ✅ 调用 `transferAssetsForLP()` 
2. ✅ 转移20% token + USDC到LP部署地址
3. ✅ 创建Uniswap V3 pool
4. ✅ 添加流动性
5. ✅ LP NFT归LP部署地址所有

### 10. 验证

```bash
# 检查LP部署状态
curl http://localhost:3002/api/tokens/0xTokenAddress | jq '.liquidityDeployed'
# 应该返回: true

# 检查LP部署地址余额（链上）
cast balance 0xLPDeployerAddress --rpc-url https://sepolia.base.org
```

## 🔍 监控

### 查看日志

服务器日志会显示：

```
🔍 Checking 1 token(s) for LP deployment readiness...
   📊 TEST: 10/10 mints (100.0%)

🎉 TEST is ready for asset transfer and LP deployment!

💧 Deploying LP for TEST (0x...)...
   📍 Step 1: Transferring assets to LP deployer...
   ✅ Assets transferred!
   📍 Step 2: Creating/initializing Uniswap V3 pool...
   ✅ Pool ready
   📍 Step 3: Approving tokens...
   ✅ Approvals complete
   📍 Step 4: Minting LP position...
   ✅ LP position minted successfully!

🎊 LP deployment complete for TEST!
```

### 数据库查询

```sql
-- 查看所有token状态
SELECT 
  symbol, 
  mint_count, 
  max_mint_count,
  liquidity_deployed,
  lp_deployer_address,
  liquidity_tx_hash
FROM deployed_tokens 
ORDER BY created_at DESC;
```

## 🛠️ 故障排查

### LP部署失败

**检查清单：**

1. LP部署地址是否有足够ETH？
   ```bash
   cast balance $LP_DEPLOYER_ADDRESS --rpc-url $RPC
   ```

2. 资产是否已转移到LP部署地址？
   ```bash
   cast call $TOKEN "assetsTransferred()" --rpc-url $RPC
   # 应该返回: true
   
   cast call $TOKEN "balanceOf(address)(uint256)" $LP_DEPLOYER_ADDRESS --rpc-url $RPC
   # 应该返回: > 0
   ```

3. 查看数据库错误
   ```sql
   SELECT lp_deployment_error, lp_deployment_error_at
   FROM deployed_tokens
   WHERE address = '0xTokenAddress';
   ```

4. 查看服务器日志
   ```bash
   tail -f server.log
   ```

### 手动触发

如果自动部署失败，可以手动触发：

```bash
# 1. 确认mint已完成
cast call $TOKEN "mintCount()" --rpc-url $RPC

# 2. 手动触发资产转移
cast send $TOKEN "transferAssetsForLP()" \
  --private-key $ADMIN_KEY \
  --rpc-url $RPC

# 3. 等待LP监听器自动部署（15-30秒）
# 或者重启服务器触发检查
```

## 📊 对比

| 功能 | 旧方案（V4） | 新方案（简化） |
|------|-------------|--------------|
| 合约复杂度 | 高 | 低 |
| Gas估算 | 困难 | 容易 |
| 失败风险 | 高 | 低 |
| LP控制 | 合约内 | 专用地址 |
| 部署方式 | 合约自动 | 后端自动 |
| 可重试 | 否 | 是 |

## 🎯 优势

1. **合约简单** - 只需转账，无复杂逻辑
2. **可靠** - 后端可以重试，调整参数
3. **灵活** - LP NFT在专用地址，易管理
4. **透明** - 每步都有清晰日志
5. **可维护** - 出问题容易定位和修复

## 📚 相关文档

- [SIMPLE_LP_DEPLOYMENT.md](SIMPLE_LP_DEPLOYMENT.md) - 详细技术文档
- [contracts/contracts/PAYX_Simple.sol](contracts/contracts/PAYX_Simple.sol) - 简化合约代码
- [server/services/lpDeployerSimple.ts](server/services/lpDeployerSimple.ts) - LP监听器代码

## 🆘 需要帮助？

如果遇到问题：
1. 检查环境变量配置
2. 查看服务器日志
3. 验证链上数据
4. 查询数据库状态

---

**就这么简单！** 🎉

