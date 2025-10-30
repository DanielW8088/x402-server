# PM2 服务管理指南

统一的 PM2 配置文件，管理 Token Server 和 LP Deployer 两个服务。

## 快速开始

```bash
cd /path/to/server

# 1. 确保 .env 文件配置正确
cat .env | grep -E "DATABASE_URL|LP_DEPLOYER_PRIVATE_KEY|LAUNCH_TOOL_ADDRESS"

# 2. 确保依赖已安装
npm install

# 3. 启动所有服务
pm2 start ecosystem.config.cjs

# 4. 查看状态
pm2 status
```

## 启动命令

### 启动所有服务
```bash
pm2 start ecosystem.config.cjs
```

### 只启动 Token Server
```bash
pm2 start ecosystem.config.cjs --only token-server
```

### 只启动 LP Deployer
```bash
pm2 start ecosystem.config.cjs --only lp-deployer
```

## 管理命令

### 查看状态
```bash
pm2 status              # 所有服务状态
pm2 list                # 同上
```

### 查看日志
```bash
pm2 logs                        # 所有服务日志（实时）
pm2 logs token-server           # Token Server 日志
pm2 logs lp-deployer            # LP Deployer 日志
pm2 logs --lines 100            # 查看最近 100 行
pm2 logs --err                  # 只看错误日志
```

### 重启服务
```bash
pm2 restart ecosystem.config.cjs              # 重启所有
pm2 restart token-server                      # 重启 Token Server
pm2 restart lp-deployer                       # 重启 LP Deployer
pm2 restart all                               # 重启所有（简写）
```

### 停止服务
```bash
pm2 stop ecosystem.config.cjs                 # 停止所有
pm2 stop token-server                         # 停止 Token Server
pm2 stop lp-deployer                          # 停止 LP Deployer
pm2 stop all                                  # 停止所有（简写）
```

### 删除服务
```bash
pm2 delete ecosystem.config.cjs               # 删除所有
pm2 delete token-server                       # 删除 Token Server
pm2 delete lp-deployer                        # 删除 LP Deployer
pm2 delete all                                # 删除所有（简写）
```

## 监控

### 实时监控面板
```bash
pm2 monit
```

显示：
- CPU 使用率
- 内存使用率
- 实时日志

### 详细信息
```bash
pm2 show token-server           # Token Server 详情
pm2 show lp-deployer            # LP Deployer 详情
```

### Web 面板
```bash
pm2 plus
```

## 开机自启动

```bash
# 1. 保存当前 PM2 进程列表
pm2 save

# 2. 生成启动脚本
pm2 startup

# 3. 执行输出的命令（通常需要 sudo）
# 例如: sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u username --hp /home/username

# 4. 验证
pm2 list
```

## 日志管理

### 日志轮转（防止日志文件过大）
```bash
# 安装 pm2-logrotate
pm2 install pm2-logrotate

# 配置
pm2 set pm2-logrotate:max_size 10M       # 单个文件最大 10MB
pm2 set pm2-logrotate:retain 7           # 保留 7 个历史文件
pm2 set pm2-logrotate:compress true      # 压缩旧日志
pm2 set pm2-logrotate:rotateInterval '0 0 * * *'  # 每天午夜轮转
```

### 清空日志
```bash
pm2 flush                       # 清空所有日志
pm2 flush token-server          # 清空 Token Server 日志
pm2 flush lp-deployer           # 清空 LP Deployer 日志
```

### 查看日志文件位置
```bash
ls -lh ./logs/
# server-error.log        - Token Server 错误日志
# server-out.log          - Token Server 输出日志
# lp-deployer-error.log   - LP Deployer 错误日志
# lp-deployer-out.log     - LP Deployer 输出日志
```

## 环境变量

PM2 会自动加载 `.env` 文件（通过 `ecosystem.config.cjs` 中的 `require('dotenv').config()`）。

### 验证环境变量
```bash
# 查看服务的环境变量
pm2 show token-server | grep -A 20 "env"
pm2 show lp-deployer | grep -A 20 "env"
```

### 重新加载环境变量
```bash
# 修改 .env 后需要重启服务
pm2 restart ecosystem.config.cjs --update-env
```

## 常见场景

### 场景 1: 只运行 Token Server（不部署 LP）
```bash
pm2 start ecosystem.config.cjs --only token-server
```

### 场景 2: 同时运行两个服务
```bash
pm2 start ecosystem.config.cjs
```

### 场景 3: 先运行 Token Server，后续再启动 LP Deployer
```bash
# 启动 Token Server
pm2 start ecosystem.config.cjs --only token-server

# 等 LaunchTool 部署好后，启动 LP Deployer
pm2 start ecosystem.config.cjs --only lp-deployer
```

### 场景 4: 更新代码后重启
```bash
# 拉取代码
git pull

# 重新构建（如果有改动）
npm run build

# 重启服务
pm2 restart ecosystem.config.cjs
```

### 场景 5: 清理并重新启动
```bash
# 删除所有旧服务
pm2 delete all

# 重新启动
pm2 start ecosystem.config.cjs

# 保存
pm2 save
```

## 故障排查

### 服务无法启动
```bash
# 1. 查看错误日志
pm2 logs lp-deployer --err --lines 50

# 2. 检查环境变量
cat .env

# 3. 手动运行测试
npx tsx lp-deployer-standalone.ts

# 4. 检查依赖
npm install
which tsx
```

### 服务频繁重启
```bash
# 查看重启次数
pm2 status

# 如果重启次数很高，查看错误日志
pm2 logs --err

# 常见原因：
# - 内存超限（max_memory_restart）
# - 未捕获的异常
# - 环境变量缺失
```

### 内存占用过高
```bash
# 查看内存使用
pm2 status

# 调整内存限制
# 编辑 ecosystem.config.cjs:
# max_memory_restart: '500M'  -> '1G'

# 重启
pm2 restart ecosystem.config.cjs
```

## 性能优化

### 集群模式（仅 Token Server）
```javascript
// ecosystem.config.cjs
{
  name: 'token-server',
  script: 'dist/index-multi-token.js',
  instances: 4,  // 或 'max' 使用所有 CPU 核心
  exec_mode: 'cluster',
  // ...
}
```

⚠️ **注意**: LP Deployer 不应使用集群模式，因为它需要单例运行。

## 完整状态示例

```bash
$ pm2 status
┌────┬────────────────┬──────────┬──────┬───────────┬──────────┬──────────┐
│ id │ name           │ mode     │ ↺    │ status    │ cpu      │ memory   │
├────┼────────────────┼──────────┼──────┼───────────┼──────────┼──────────┤
│ 0  │ token-server   │ fork     │ 0    │ online    │ 0%       │ 120.0mb  │
│ 1  │ lp-deployer    │ fork     │ 0    │ online    │ 0%       │ 55.0mb   │
└────┴────────────────┴──────────┴──────┴───────────┴──────────┴──────────┘
```

## 备用配置文件

如果只需要启动 LP Deployer，可以使用：
```bash
pm2 start ecosystem.lp-deployer.cjs
```

---

**相关文档:**
- [LP Deployer 使用指南](./LP_DEPLOYER_README.md)
- [Server README](./README.md)

