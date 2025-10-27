# 独立LP部署器服务

LP部署功能已拆分为独立程序，可以与主服务器分开运行。

## 🎯 功能

- 监控数据库中需要部署LP的token
- 自动检测mint完成的token
- 调用 `transferAssetsForLP()` 转移资产
- 创建Uniswap V3流动性池
- 部署LP到池子
- 自动重试失败的部署（最多5次）

## 📋 环境变量

需要在 `.env` 文件中配置：

```bash
# 数据库
DATABASE_URL=postgresql://user:pass@localhost:5432/dbname

# 网络配置
NETWORK=baseSepolia                    # 或 "base" 用于主网
RPC_URL=https://sepolia.base.org       # RPC endpoint

# 钱包私钥
PRIVATE_KEY=0x...                      # 管理员钱包（调用transferAssetsForLP）
LP_DEPLOYER_PRIVATE_KEY=0x...          # LP部署钱包（部署LP到Uniswap）
```

## 🚀 运行方式

### 方式1：独立运行LP部署器

**只运行LP部署器**（不运行主服务器）：

```bash
cd server
npm run lp-deployer
```

或带自动重启（开发模式）：

```bash
npm run lp-deployer:watch
```

### 方式2：同时运行主服务器和LP部署器

**在不同终端窗口**：

```bash
# 终端 1: 主服务器（处理API请求、mint队列）
cd server
npm run dev:multi-token

# 终端 2: LP部署器（只处理LP部署）
cd server
npm run lp-deployer
```

### 方式3：使用PM2管理多个进程

```bash
# 安装PM2
npm install -g pm2

# 创建 ecosystem.config.js
cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [
    {
      name: 'main-server',
      script: 'index-multi-token.ts',
      interpreter: 'tsx',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'lp-deployer',
      script: 'lp-deployer-standalone.ts',
      interpreter: 'tsx',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
EOF

# 启动所有服务
pm2 start ecosystem.config.js

# 查看状态
pm2 status

# 查看日志
pm2 logs

# 停止所有
pm2 stop all

# 重启
pm2 restart all
```

## 📊 监控

### 实时日志

```bash
# 如果用npm运行
# 日志会直接输出到终端

# 如果用PM2
pm2 logs lp-deployer
```

### 日志示例

```
╔══════════════════════════════════════════════════╗
║   Standalone LP Deployer Service                 ║
║   Monitors and deploys liquidity pools           ║
╚══════════════════════════════════════════════════╝

🔧 Standalone LP Deployer initialized
   Network: baseSepolia
   RPC: https://sepolia.base.org
   Admin: 0x12eb...8DC9
   LP Deployer: 0xf7a6...06aF
   Position Manager: 0x27F9...faA2

🚀 Starting LP Deployer Monitor...
   Check interval: 15s

🔍 Checking 2 token(s) for LP deployment readiness...
   📊 Token1: 5/10 mints (50.0%)
   📊 Token2: 10/10 mints (100.0%)

🎉 Token2 is ready for asset transfer and LP deployment!

💧 Deploying LP for Token2 (0x2256...)...
   Pool config: fee=10000 (1%)
   📍 Step 1: Transferring assets to LP deployer...
   ✅ Assets transferred!
   💰 LP Deployer balances:
      Token: 25000000000000000000000
      USDC: 2500000
   📍 Step 1: Creating/initializing Uniswap V3 pool...
   💱 Price calculation:
      balance0: 2500000
      balance1: 25000000000000000000000
      sqrtPriceX96: 250541448375047931186413801569
   ✅ Pool ready: 0x7a41...bdff
   📍 Step 2: Approving tokens...
   ✅ Approvals complete
   📍 Step 3: Minting LP position...
   ✅ LP position minted successfully!
   ✅ Database updated

🎊 LP deployment complete for Token2!
```

## 🔄 重试机制

- **自动重试**：失败5分钟后自动重试
- **最大重试次数**：5次
- **重试状态**：记录在数据库 `lp_retry_count` 字段

### 手动触发重试

```sql
-- 重置特定token的重试计数
UPDATE deployed_tokens 
SET lp_deployment_error = NULL,
    lp_deployment_error_at = NULL,
    lp_retry_count = 0
WHERE address = '0xTokenAddress';

-- 重置所有失败的token
UPDATE deployed_tokens 
SET lp_deployment_error = NULL,
    lp_deployment_error_at = NULL,
    lp_retry_count = 0
WHERE lp_deployment_error IS NOT NULL;
```

## 🛠️ 故障排查

### 1. LP部署器无法连接数据库

```bash
# 检查DATABASE_URL
echo $DATABASE_URL

# 测试数据库连接
psql $DATABASE_URL -c "SELECT version();"
```

### 2. LP部署器地址没有ETH

```bash
# 检查余额
cast balance $LP_DEPLOYER_ADDRESS --rpc-url $RPC_URL

# 转ETH
cast send $LP_DEPLOYER_ADDRESS \
  --value 0.01ether \
  --private-key $YOUR_FUNDED_KEY \
  --rpc-url $RPC_URL
```

### 3. 查看失败的部署

```sql
SELECT 
  address,
  symbol,
  lp_deployment_error,
  lp_retry_count,
  lp_deployment_error_at
FROM deployed_tokens
WHERE lp_deployment_error IS NOT NULL
ORDER BY lp_deployment_error_at DESC;
```

### 4. 手动部署LP

如果自动部署失败，可以手动运行：

```bash
# 进入contracts目录
cd ../contracts

# 使用脚本手动部署LP
# （需要先实现手动部署脚本）
```

## 📈 性能优化

### 调整检查间隔

修改 `lp-deployer-standalone.ts`：

```typescript
// 默认15秒
private checkInterval: number = 15000;

// 改为30秒（降低数据库负载）
private checkInterval: number = 30000;

// 改为5秒（更快响应）
private checkInterval: number = 5000;
```

### 数据库索引

确保有合适的索引：

```sql
-- 检查索引
\d deployed_tokens

-- 如果缺少索引，添加：
CREATE INDEX IF NOT EXISTS idx_lp_deployment_pending 
ON deployed_tokens(liquidity_deployed, is_active, created_at) 
WHERE liquidity_deployed = false;

CREATE INDEX IF NOT EXISTS idx_lp_deployment_retry 
ON deployed_tokens(lp_deployment_error_at, lp_retry_count) 
WHERE lp_deployment_error IS NOT NULL;
```

## 🔐 安全注意事项

1. **私钥管理**
   - 永远不要提交 `.env` 文件
   - 使用环境变量或密钥管理服务
   - LP部署器钱包应该只有必要的ETH

2. **权限**
   - LP部署器只需要读取数据库和更新 `liquidity_deployed` 字段
   - 不需要管理员权限

3. **资金安全**
   - LP部署后，流动性由LP部署器地址持有
   - 确保保管好LP部署器私钥
   - 考虑使用多签钱包

## 🆚 对比：集成 vs 独立

### 集成在主服务器中

**优点**：
- 一个进程，简单
- 共享连接池

**缺点**：
- LP部署问题可能影响主服务
- 资源竞争
- 难以独立扩展

### 独立部署器 ✅

**优点**：
- 隔离：LP问题不影响主服务
- 可独立重启/更新
- 可在不同服务器运行
- 易于监控和调试
- 可以独立扩展

**缺点**：
- 需要管理两个进程
- 略微增加复杂度

## 📝 常见问题

**Q: 主服务器和LP部署器可以同时运行吗？**

A: 可以！它们通过数据库协调工作，不会冲突。

**Q: 可以运行多个LP部署器实例吗？**

A: 可以，但不推荐。代码中有 `processingTokens` 防止同一token被多次处理，但多实例可能导致竞争。

**Q: LP部署失败了怎么办？**

A: 系统会自动重试最多5次。如果还是失败，检查日志和错误信息，手动解决问题后重置重试计数。

**Q: 如何停止LP部署器？**

A: 按 `Ctrl+C` 优雅退出。如果用PM2: `pm2 stop lp-deployer`

## 🔗 相关文档

- [LP部署方案](SIMPLE_LP_DEPLOYMENT.md)
- [重试机制](LP_RETRY_MECHANISM.md)
- [主服务器文档](README.md)

---

**独立运行，更加可靠！** 🚀

