# ⚡ 快速启动

## 一键启动

```bash
cd server

# 启动所有服务
./start.sh

# 或只启动特定服务
./start.sh token-server    # 只启动 Token Server
./start.sh lp-deployer     # 只启动 LP Deployer
```

## PM2 命令

```bash
# 启动
pm2 start ecosystem.config.cjs                    # 所有服务
pm2 start ecosystem.config.cjs --only token-server   # Token Server
pm2 start ecosystem.config.cjs --only lp-deployer    # LP Deployer

# 查看
pm2 status                 # 状态
pm2 logs                   # 日志
pm2 monit                  # 监控面板

# 管理
pm2 restart all            # 重启所有
pm2 stop all               # 停止所有
pm2 delete all             # 删除所有
```

## 配置检查

```bash
# 检查 .env
cat .env | grep -E "DATABASE_URL|LP_DEPLOYER_PRIVATE_KEY|LAUNCH_TOOL_ADDRESS"

# 测试数据库连接
psql $DATABASE_URL -c "SELECT 1;"

# 手动运行 LP Deployer
npx tsx lp-deployer-standalone.ts
```

## 服务状态

运行正常时应该看到：

```
┌────┬────────────────┬──────────┬──────┬───────────┬──────────┬──────────┐
│ id │ name           │ mode     │ ↺    │ status    │ cpu      │ memory   │
├────┼────────────────┼──────────┼──────┼───────────┼──────────┼──────────┤
│ 0  │ token-server   │ fork     │ 0    │ online    │ 0%       │ 120.0mb  │
│ 1  │ lp-deployer    │ fork     │ 0    │ online    │ 0%       │ 55.0mb   │
└────┴────────────────┴──────────┴──────┴───────────┴──────────┴──────────┘
```

## 故障排查

```bash
# 查看错误日志
pm2 logs lp-deployer --err --lines 50

# 查看日志文件
cat logs/lp-deployer-error.log
cat logs/server-error.log

# 重启服务
pm2 restart all

# 完全清理重启
pm2 delete all
pm2 start ecosystem.config.cjs
```

## 必需的环境变量

### Token Server
- `DATABASE_URL`
- `SERVER_PRIVATE_KEY`
- `MINTER_PRIVATE_KEY`

### LP Deployer
- `DATABASE_URL`
- `LP_DEPLOYER_PRIVATE_KEY` (必须是 token owner)
- `LAUNCH_TOOL_ADDRESS` (LaunchTool 合约地址)

## 详细文档

- 📖 [PM2 完整指南](./PM2_GUIDE.md)
- 📖 [LP Deployer 使用指南](./LP_DEPLOYER_README.md)
- 📖 [Server README](./README.md)

