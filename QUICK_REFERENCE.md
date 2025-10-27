# 快速参考 - 分离式架构

## 🚀 启动命令

### 开发环境
```bash
# 终端1: 主服务器
cd server && npm run dev:multi-token

# 终端2: LP部署器  
cd server && npm run lp-deployer
```

### 生产环境
```bash
# 使用PM2
cd server
chmod +x start-all.sh stop-all.sh
./start-all.sh

# 查看状态
pm2 status

# 查看日志
pm2 logs

# 停止
./stop-all.sh
```

## 📝 NPM脚本

```bash
# 主服务器
npm run dev:multi-token      # 开发模式（自动重启）
npm run start:multi-token    # 生产模式

# LP部署器
npm run lp-deployer          # 运行LP部署器
npm run lp-deployer:watch    # 开发模式（自动重启）
```

## 🔧 环境变量

### 必需（两个服务都需要）
```bash
DATABASE_URL=postgresql://user:pass@host:5432/dbname
NETWORK=baseSepolia
RPC_URL=https://sepolia.base.org
PRIVATE_KEY=0x...
```

### 主服务器额外需要
```bash
PORT=3002
EXCESS_RECIPIENT_ADDRESS=0x...
```

### LP部署器额外需要
```bash
LP_DEPLOYER_PRIVATE_KEY=0x...
```

## 📊 PM2命令

```bash
pm2 start ecosystem.config.js  # 启动所有
pm2 stop all                   # 停止所有
pm2 restart all                # 重启所有
pm2 delete all                 # 删除所有
pm2 logs                       # 查看所有日志
pm2 logs token-server          # 只看主服务器
pm2 logs lp-deployer           # 只看LP部署器
pm2 monit                      # 实时监控
pm2 status                     # 查看状态
```

## 🔍 常用查询

### 查看待部署LP的token
```sql
SELECT address, symbol, liquidity_deployed, lp_deployment_error
FROM deployed_tokens
WHERE liquidity_deployed = false
ORDER BY created_at DESC;
```

### 重置失败的LP部署
```sql
UPDATE deployed_tokens 
SET lp_deployment_error = NULL,
    lp_deployment_error_at = NULL,
    lp_retry_count = 0
WHERE address = '0xTokenAddress';
```

### 查看最近的LP部署
```sql
SELECT address, symbol, liquidity_tx_hash, liquidity_deployed_at
FROM deployed_tokens
WHERE liquidity_deployed = true
ORDER BY liquidity_deployed_at DESC
LIMIT 10;
```

## 🐛 故障排查

### 检查服务运行
```bash
# PM2
pm2 status

# 手动
ps aux | grep "index-multi-token\|lp-deployer"
```

### 检查端口
```bash
lsof -i :3002  # 主服务器
```

### 检查数据库连接
```bash
psql $DATABASE_URL -c "SELECT version();"
```

### 检查LP部署器余额
```bash
# 从私钥获取地址
node -e "
const { privateKeyToAccount } = require('viem/accounts');
const acc = privateKeyToAccount(process.env.LP_DEPLOYER_PRIVATE_KEY);
console.log(acc.address);
"

# 检查余额
cast balance <ADDRESS> --rpc-url $RPC_URL
```

## 📂 关键文件

```
server/
├── index-multi-token.ts       # 主服务器
├── lp-deployer-standalone.ts  # LP部署器
├── package.json               # NPM脚本
├── ecosystem.config.js        # PM2配置
├── services/
│   └── tokenDeployer.ts       # Token部署
└── queue/
    └── processor.ts           # Mint队列
```

## 🌐 API端点

```bash
# 健康检查
GET http://localhost:3002/health

# 部署token
POST http://localhost:3002/api/deploy

# 查看所有tokens
GET http://localhost:3002/api/tokens

# Mint token
POST http://localhost:3002/api/mint/:address

# 队列状态
GET http://localhost:3002/api/queue/:queueId
```

## 📖 完整文档

- [CLEANUP_COMPLETE.md](CLEANUP_COMPLETE.md) - 清理完成总结
- [LP_DEPLOYER_STANDALONE.md](LP_DEPLOYER_STANDALONE.md) - LP部署器文档
- [QUICK_START_SPLIT.md](QUICK_START_SPLIT.md) - 快速开始

## 💡 提示

1. **开发**: 分别在两个终端运行，方便调试
2. **生产**: 使用PM2管理，自动重启和日志
3. **监控**: 定期检查 `pm2 logs` 和数据库错误
4. **备份**: LP部署器钱包持有LP NFT，保管好私钥
5. **资金**: LP部署器只需少量ETH（~0.01 ETH）

---

**快速参考，常用命令一目了然！** ⚡

