# Multi-RPC 快速设置指南

## 立即开始（3步）

### 1. 编辑 `.env` 文件

```bash
# 原来的配置（单RPC）
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# 改成多RPC（用逗号分隔）
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org,https://base-sepolia.gateway.tenderly.co
```

### 2. 重启服务

```bash
# PM2
pm2 restart server

# 或直接运行
npm start
```

### 3. 验证配置

启动时会显示：
```
🌐 RPC Configuration: 2 endpoint(s)
   1. https://sepolia.base.org
   2. https://base-sepolia.gateway.tenderly.co
```

## 推荐配置

### 测试网（Base Sepolia）

```bash
# 基础（1个）
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org

# 推荐（2个）
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org,https://base-sepolia.gateway.tenderly.co

# 高负载（3个，需要Alchemy账号）
BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY,https://sepolia.base.org,https://base-sepolia.gateway.tenderly.co
```

### 主网（Base Mainnet）

```bash
# 基础（1个）
BASE_RPC_URL=https://mainnet.base.org

# 推荐（3个，免费）
BASE_RPC_URL=https://mainnet.base.org,https://base.llamarpc.com,https://base.gateway.tenderly.co

# 生产环境（5个，带付费节点）
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/KEY1,https://base-mainnet.g.alchemy.com/v2/KEY2,https://mainnet.base.org,https://base.llamarpc.com,https://base.gateway.tenderly.co
```

## 获取私有RPC（可选）

### Alchemy（推荐）
1. 访问 https://dashboard.alchemy.com/
2. 创建免费账号
3. 创建新App（选择Base或Base Sepolia）
4. 复制HTTP URL
5. 免费额度：300M Compute Units/月

### Infura
1. 访问 https://infura.io/
2. 创建项目
3. 启用Base网络
4. 复制endpoint URL
5. 免费额度：100k requests/天

### QuickNode
1. 访问 https://www.quicknode.com/
2. 创建endpoint
3. 选择Base
4. 最低$9/月

## 常见问题

### Q: RPC URL末尾的斜杠会影响吗？
不会。系统会自动标准化URL，去除末尾的斜杠。

```bash
# 这些配置都是等效的
BASE_RPC_URL=https://example.com/
BASE_RPC_URL=https://example.com///
BASE_RPC_URL=https://example.com
```

### Q: 需要几个RPC？
- **开发/测试**: 1-2个免费RPC足够
- **中等流量**: 3个（混合免费+付费）
- **高流量**: 5个以上（主要是付费）

### Q: 是否必须配置多个？
不是必须的。单个RPC也能正常工作，但多个RPC能：
- 提高吞吐量（3个RPC = 3倍请求量）
- 避免速率限制
- 自动故障转移

### Q: 公共RPC够用吗？
- **测试环境**: 够用
- **生产环境**: 建议至少1-2个付费私有RPC

### Q: 配置错误会怎样？
系统会自动fallback到默认的公共RPC，不会崩溃。

## 效果对比

```
场景：100个用户同时mint

单RPC:
- 处理时间: ~60秒
- 429错误: 15次
- 成功率: 85%

多RPC (3个):
- 处理时间: ~25秒  ⚡️ 
- 429错误: 0次     ✅
- 成功率: 100%     ✅
```

## 更多信息

详细文档：[RPC_LOAD_BALANCING.md](./RPC_LOAD_BALANCING.md)

---

**提示**: 配置多RPC后记得重启服务！

