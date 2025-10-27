# LP部署器分离 - 完成总结

## ✅ 已完成

### 1. 创建独立LP部署器程序

**文件**: `server/lp-deployer-standalone.ts`

- 完全独立的Node.js程序
- 不依赖Express或API
- 只连接数据库和区块链
- 每15秒检查一次待部署的LP
- 支持自动重试（最多5次）

### 2. NPM脚本

更新 `server/package.json`:

```json
{
  "lp-deployer": "tsx lp-deployer-standalone.ts",
  "lp-deployer:watch": "tsx watch lp-deployer-standalone.ts"
}
```

### 3. PM2配置

**文件**: `server/ecosystem.config.js`

- 定义两个app：`token-server` 和 `lp-deployer`
- 配置自动重启、内存限制、日志文件
- 支持 `pm2 start ecosystem.config.js` 一键启动

### 4. 启动脚本

- `server/start-all.sh` - 启动所有服务
- `server/stop-all.sh` - 停止所有服务

### 5. 文档

- `LP_DEPLOYER_STANDALONE.md` - 完整文档
- `QUICK_START_SPLIT.md` - 快速开始指南
- `LP_SPLIT_SUMMARY.md` - 本文件

## 🏗️ 架构变化

### 之前（集成式）

```
┌─────────────────────────────┐
│      Main Server            │
│                             │
│  • API                      │
│  • Token deployment         │
│  • Mint queue               │
│  • LP deployment (内置)     │
│                             │
└──────────────┬──────────────┘
               │
        ┌──────▼──────┐
        │  Database   │
        └─────────────┘
```

### 现在（分离式）

```
┌──────────────────┐       ┌────────────────────┐
│  Main Server     │       │  LP Deployer       │
│                  │       │  (独立进程)         │
│  • API           │       │                    │
│  • Deploy tokens │       │  • 监控数据库       │
│  • Mint queue    │       │  • 转移资产         │
│                  │       │  • 创建Pool         │
└────────┬─────────┘       │  • 部署LP           │
         │                 └────────┬───────────┘
         │                          │
         └─────────┬────────────────┘
                   │
            ┌──────▼──────┐
            │  Database   │
            └─────────────┘
```

## 📋 使用方法

### 选项1：分别启动（开发）

```bash
# 终端1
cd server
npm run dev:multi-token

# 终端2
cd server
npm run lp-deployer
```

### 选项2：PM2管理（生产）

```bash
cd server
chmod +x start-all.sh
./start-all.sh

# 查看状态
pm2 status

# 查看日志
pm2 logs

# 停止
./stop-all.sh
```

### 选项3：只运行LP部署器

如果主服务器已在其他地方运行：

```bash
cd server
npm run lp-deployer
```

## 🔧 配置要求

### 环境变量

```bash
# 两个程序都需要
DATABASE_URL=postgresql://...
NETWORK=baseSepolia
RPC_URL=https://sepolia.base.org

# 主服务器需要
PORT=3002
PRIVATE_KEY=0x...  # 管理员钱包

# LP部署器需要
PRIVATE_KEY=0x...           # 用于调用transferAssetsForLP
LP_DEPLOYER_PRIVATE_KEY=0x... # 用于部署LP
```

### 数据库

运行迁移（如果还没运行）：

```bash
cd server
psql $DATABASE_URL -f run-migrations.sql
```

### 资金

LP部署器地址需要ETH支付gas：

```bash
# 查看LP部署器地址
node -e "
const { privateKeyToAccount } = require('viem/accounts');
const account = privateKeyToAccount(process.env.LP_DEPLOYER_PRIVATE_KEY);
console.log(account.address);
"

# 转入0.01 ETH
cast send <LP_DEPLOYER_ADDRESS> --value 0.01ether --private-key $FUNDED_KEY
```

## ✨ 优势

### 1. 隔离性
- LP部署问题不影响API服务
- 主服务器崩溃不影响LP部署

### 2. 可维护性
- 清晰的职责分离
- 更容易调试和监控
- 独立的日志文件

### 3. 可扩展性
- 可以在不同服务器运行
- 可以独立调整资源
- 可以独立升级

### 4. 可靠性
- 一个服务崩溃不影响另一个
- 可以独立重启
- 更好的错误隔离

## 📊 监控

### PM2监控

```bash
# 实时Dashboard
pm2 monit

# 查看日志
pm2 logs

# 只看LP部署器
pm2 logs lp-deployer --lines 100
```

### 数据库监控

```sql
-- 查看待部署LP的token
SELECT 
  address, symbol, 
  lp_deployment_error,
  lp_retry_count
FROM deployed_tokens
WHERE liquidity_deployed = false;

-- 查看最近的LP部署
SELECT 
  address, symbol,
  liquidity_deployed,
  liquidity_tx_hash,
  liquidity_deployed_at
FROM deployed_tokens
WHERE liquidity_deployed = true
ORDER BY liquidity_deployed_at DESC
LIMIT 10;
```

## 🔄 工作流程

1. **用户请求部署token** → 主服务器处理
2. **用户mint token** → 主服务器处理mint队列
3. **所有mint完成** → LP部署器检测到
4. **LP部署器调用transferAssetsForLP** → 使用管理员钱包
5. **资产转移到LP部署器地址**
6. **LP部署器创建Pool和部署LP** → 使用LP部署器钱包
7. **更新数据库** → LP部署器标记完成

## 🐛 故障排查

### LP部署器没启动

```bash
# 检查进程
pm2 status

# 或
ps aux | grep lp-deployer
```

### LP不部署

1. 检查LP部署器日志
2. 检查数据库 `lp_deployment_error` 字段
3. 检查LP部署器地址ETH余额
4. 手动重置重试计数

### 数据库连接问题

```bash
# 测试连接
psql $DATABASE_URL -c "SELECT version();"
```

## 📖 相关文档

- [LP_DEPLOYER_STANDALONE.md](LP_DEPLOYER_STANDALONE.md) - 完整文档
- [QUICK_START_SPLIT.md](QUICK_START_SPLIT.md) - 快速开始
- [LP_RETRY_MECHANISM.md](LP_RETRY_MECHANISM.md) - 重试机制
- [SIMPLE_LP_DEPLOYMENT.md](SIMPLE_LP_DEPLOYMENT.md) - LP部署方案

## 🎯 下一步

1. **运行迁移** - 确保数据库有 `lp_retry_count` 字段
2. **配置环境变量** - 特别是 `LP_DEPLOYER_PRIVATE_KEY`
3. **资金准备** - 给LP部署器地址转ETH
4. **启动服务** - 使用PM2或分别启动
5. **测试** - 部署一个token，完成所有mint，观察LP自动部署

## ✅ 验证清单

- [ ] LP部署器可以成功启动
- [ ] LP部署器连接到数据库
- [ ] LP部署器地址有足够ETH
- [ ] 主服务器正常运行
- [ ] 完成一次完整的token部署 → mint → LP部署流程
- [ ] 查看PM2日志正常
- [ ] 数据库正确记录LP部署状态

---

**分离式架构已就绪！** 🚀

现在你有：
- ✅ 独立的LP部署器程序
- ✅ PM2配置文件
- ✅ 启动/停止脚本
- ✅ 完整文档

可以开始使用了！

