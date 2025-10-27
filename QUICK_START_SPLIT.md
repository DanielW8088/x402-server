# 快速开始 - 分离式架构

LP部署器现在是独立程序，与主服务器分开运行。

## 🏗️ 架构

```
┌─────────────────────┐     ┌──────────────────────┐
│   Main Server       │     │   LP Deployer        │
│   (Port 3002)       │     │   (独立进程)          │
├─────────────────────┤     ├──────────────────────┤
│ • API endpoints     │     │ • 监控数据库          │
│ • Token deployment  │     │ • 转移资产            │
│ • Mint queue        │     │ • 创建Pool            │
│ • User requests     │     │ • 部署LP              │
└──────────┬──────────┘     └──────────┬───────────┘
           │                           │
           └───────────┬───────────────┘
                       │
                ┌──────▼──────┐
                │  PostgreSQL  │
                │   Database   │
                └──────────────┘
```

## 🚀 启动方式

### 方式1：分别启动（推荐）

**终端1 - 主服务器：**
```bash
cd server
npm run dev:multi-token
```

**终端2 - LP部署器：**
```bash
cd server
npm run lp-deployer
```

### 方式2：使用PM2管理

```bash
cd server

# 安装PM2（如果没有）
npm install -g pm2

# 启动所有服务
chmod +x start-all.sh
./start-all.sh

# 查看状态
pm2 status

# 查看日志
pm2 logs

# 停止所有
./stop-all.sh
```

### 方式3：开发模式（自动重启）

**终端1：**
```bash
cd server
npm run dev:multi-token
```

**终端2：**
```bash
cd server
npm run lp-deployer:watch
```

## ✅ 验证运行

### 主服务器

访问 http://localhost:3002/health 应该返回：
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### LP部署器

终端应该显示：
```
╔══════════════════════════════════════════════════╗
║   Standalone LP Deployer Service                 ║
║   Monitors and deploys liquidity pools           ║
╚══════════════════════════════════════════════════╝

🔧 Standalone LP Deployer initialized
   Network: baseSepolia
   ...

🚀 Starting LP Deployer Monitor...
   Check interval: 15s
```

## 📊 监控

### PM2 Dashboard

```bash
# 实时监控
pm2 monit

# 查看日志
pm2 logs

# 只看主服务器日志
pm2 logs token-server

# 只看LP部署器日志
pm2 logs lp-deployer
```

### 日志文件

如果使用PM2，日志保存在：
```
server/logs/
├── server-out.log        # 主服务器输出
├── server-error.log      # 主服务器错误
├── lp-deployer-out.log   # LP部署器输出
└── lp-deployer-error.log # LP部署器错误
```

## 🔧 配置

### 环境变量

确保 `.env` 包含：

```bash
# 主服务器
PORT=3002
DATABASE_URL=postgresql://...
PRIVATE_KEY=0x...
NETWORK=baseSepolia
RPC_URL=https://sepolia.base.org

# LP部署器（与主服务器共享）
LP_DEPLOYER_PRIVATE_KEY=0x...
```

### 调整检查间隔

编辑 `lp-deployer-standalone.ts`:

```typescript
private checkInterval: number = 15000; // 15秒（默认）
// 改为 30000 (30秒) 以降低负载
// 改为 5000 (5秒) 以更快响应
```

## 🛠️ 故障排查

### LP部署器无法启动

1. **检查环境变量：**
```bash
cd server
cat .env | grep LP_DEPLOYER_PRIVATE_KEY
```

2. **检查数据库连接：**
```bash
psql $DATABASE_URL -c "SELECT COUNT(*) FROM deployed_tokens;"
```

3. **检查LP部署器余额：**
```bash
# 从LP_DEPLOYER_PRIVATE_KEY推导地址
node -e "
const { privateKeyToAccount } = require('viem/accounts');
const account = privateKeyToAccount(process.env.LP_DEPLOYER_PRIVATE_KEY);
console.log('LP Deployer:', account.address);
"

# 检查余额
cast balance <LP_DEPLOYER_ADDRESS> --rpc-url $RPC_URL
```

### LP部署一直失败

查看详细日志：
```bash
# 如果直接运行
# 日志已在终端显示

# 如果用PM2
pm2 logs lp-deployer --lines 100
```

检查数据库错误记录：
```sql
SELECT 
  address,
  symbol,
  lp_deployment_error,
  lp_retry_count
FROM deployed_tokens
WHERE lp_deployment_error IS NOT NULL;
```

### 两个进程都启动了但LP不部署

1. **检查token状态：**
```sql
SELECT 
  address,
  symbol,
  liquidity_deployed,
  max_mint_count,
  (SELECT COUNT(*) FROM mint_queue WHERE token_address = deployed_tokens.address) as mint_count
FROM deployed_tokens
WHERE liquidity_deployed = false;
```

2. **手动触发：**
```sql
-- 如果mint已完成但没有部署LP，重置状态
UPDATE deployed_tokens 
SET lp_deployment_error = NULL,
    lp_retry_count = 0
WHERE address = '0xYourTokenAddress';
```

## 📖 更多文档

- [独立LP部署器完整文档](LP_DEPLOYER_STANDALONE.md)
- [LP部署方案](SIMPLE_LP_DEPLOYMENT.md)
- [重试机制](LP_RETRY_MECHANISM.md)

## 💡 提示

1. **生产环境**：推荐使用PM2管理进程
2. **开发环境**：分别在两个终端运行，方便调试
3. **日志监控**：定期检查日志文件
4. **备份私钥**：LP部署器钱包持有LP NFT，妥善保管
5. **资金管理**：LP部署器只需要少量ETH支付gas

## 🎯 优势

✅ **隔离性** - LP问题不影响主服务  
✅ **可靠性** - 可独立重启  
✅ **可扩展** - 可部署在不同服务器  
✅ **可维护** - 清晰的职责分离  
✅ **可监控** - 独立的日志和指标  

---

**分离式架构，更加稳定可靠！** 🚀

