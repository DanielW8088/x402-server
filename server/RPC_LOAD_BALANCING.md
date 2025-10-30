# RPC Load Balancing

## 概述

为了提高系统吞吐量和可靠性，服务器支持多RPC端点负载均衡。可以配置多个RPC URL，系统会自动分散请求到不同的端点。

## 功能特性

### ✅ Round-Robin 负载均衡
- 请求均匀分配到所有RPC端点
- 避免单个RPC过载导致速率限制

### ✅ 自动故障转移
- 使用viem的fallback机制
- 如果一个RPC失败，自动切换到下一个
- 内置重试机制（3次，间隔1秒）

### ✅ 简单配置
- 仅需在环境变量中用逗号分隔多个URL
- 支持单个或多个RPC URL

## 配置方法

### 单个RPC（基础配置）

```bash
# .env
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASE_RPC_URL=https://mainnet.base.org
```

### 多个RPC（推荐用于高负载）

使用逗号分隔多个RPC URL：

```bash
# Base Sepolia (测试网)
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org,https://base-sepolia.gateway.tenderly.co

# Base Mainnet (主网)
BASE_RPC_URL=https://mainnet.base.org,https://base.llamarpc.com,https://base.gateway.tenderly.co
```

### 私有RPC（生产环境最佳）

混合使用多个私有RPC服务：

```bash
# 多个Alchemy节点
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/KEY_1,https://base-mainnet.g.alchemy.com/v2/KEY_2,https://base-mainnet.g.alchemy.com/v2/KEY_3

# 混合不同服务商
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY,https://base-mainnet.infura.io/v3/YOUR_KEY,https://base.llamarpc.com
```

## RPC服务商推荐

### 免费公共RPC
适合测试和轻量使用：

| 服务商 | Base Mainnet | Base Sepolia |
|--------|--------------|--------------|
| Base Official | https://mainnet.base.org | https://sepolia.base.org |
| LlamaNodes | https://base.llamarpc.com | - |
| Tenderly | https://base.gateway.tenderly.co | https://base-sepolia.gateway.tenderly.co |

### 付费私有RPC
推荐用于生产环境：

| 服务商 | 特点 | 网站 |
|--------|------|------|
| **Alchemy** | 可靠、速度快、免费额度高 | https://dashboard.alchemy.com/ |
| **Infura** | 老牌服务、稳定性好 | https://infura.io/ |
| **QuickNode** | 低延迟、全球节点 | https://www.quicknode.com/ |
| **Ankr** | 性价比高 | https://www.ankr.com/ |

## 性能对比

### 单RPC vs 多RPC

```
单RPC配置：
- RPC请求吞吐: ~50 req/s (受单个端点限制)
- 遇到速率限制时: 整个系统卡住
- 单点故障风险: 高

多RPC配置（3个端点）：
- RPC请求吞吐: ~150 req/s (3x)
- 遇到速率限制时: 自动切换到其他端点
- 单点故障风险: 低（需要3个全挂才会影响）
```

## 工作原理

### 负载均衡策略

```typescript
// Round-robin轮询
Request 1 → RPC #1
Request 2 → RPC #2  
Request 3 → RPC #3
Request 4 → RPC #1 (循环)
Request 5 → RPC #2
...
```

### 故障转移机制

```typescript
Request → RPC #1 (失败) 
       → RPC #2 (失败)
       → RPC #3 (成功) ✅
```

使用viem的`fallback` transport，自动切换失败的端点。

## 实现细节

### 核心代码

```typescript
// server/lib/rpc-balancer.ts
export class RPCBalancer {
  // Round-robin分配
  getNextUrl(): string {
    const url = this.urls[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.urls.length;
    return url;
  }

  // 创建viem transport（自动failover）
  createTransport(config?: TransportConfig) {
    if (this.urls.length === 1) {
      return http(this.urls[0], config);
    }
    
    // 多个URL：使用fallback transport
    const transports = this.urls.map(url => http(url, config));
    return fallback(transports, { rank: false });
  }
}
```

### URL 标准化

系统自动处理URL格式问题：

```typescript
// 自动去除末尾斜杠
parseRPCUrls('https://example.com/', 'default')
// → ['https://example.com']

// 自动去除多个斜杠
parseRPCUrls('https://example.com///', 'default')  
// → ['https://example.com']

// 自动trim空格
parseRPCUrls(' https://example.com/ ', 'default')
// → ['https://example.com']
```

### 使用示例

```typescript
// 创建balancer
const rpcBalancer = createRPCBalancer(
  process.env.BASE_RPC_URL,
  "https://mainnet.base.org" // fallback default
);

// 创建transport
const transport = rpcBalancer.createTransport({
  timeout: 30000,
  retryCount: 3,
  retryDelay: 1000,
});

// 创建client
const publicClient = createPublicClient({
  chain: base,
  transport,
});
```

## 监控和日志

### 启动时显示配置

```
🌐 RPC Configuration: 3 endpoint(s)
   1. https://mainnet.base.org
   2. https://base.llamarpc.com
   3. https://base.gateway.tenderly.co
```

### 查看状态

```typescript
const status = rpcBalancer.getStatus();
console.log(status);
// {
//   totalUrls: 3,
//   currentIndex: 1,
//   urls: ['...', '...', '...']
// }
```

## 最佳实践

### 1. 生产环境配置建议

```bash
# ✅ 推荐：3-5个私有RPC节点
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/KEY1,https://base-mainnet.g.alchemy.com/v2/KEY2,https://base.llamarpc.com

# ❌ 不推荐：单个公共RPC
BASE_RPC_URL=https://mainnet.base.org
```

### 2. 选择RPC端点的原则

- **地理分布**: 选择不同地区的节点提高可用性
- **服务商多样化**: 不要全部依赖一个服务商
- **混合策略**: 付费私有RPC + 免费公共RPC备用
- **监控响应时间**: 移除长期慢的端点

### 3. 配置示例

#### 开发/测试环境
```bash
# 2个公共RPC足够
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org,https://base-sepolia.gateway.tenderly.co
```

#### 生产环境（中等负载）
```bash
# 3个节点：2个付费 + 1个免费备用
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/KEY1,https://base-mainnet.infura.io/v3/KEY2,https://mainnet.base.org
```

#### 生产环境（高负载）
```bash
# 5个节点：4个付费 + 1个免费备用
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/KEY1,https://base-mainnet.g.alchemy.com/v2/KEY2,https://base-mainnet.infura.io/v3/KEY3,https://rpc.quicknode.pro/KEY4,https://mainnet.base.org
```

## 故障排查

### 检查RPC端点是否可用

```bash
# 测试单个RPC
curl -X POST https://mainnet.base.org \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}'

# 应该返回当前区块号
```

### 常见问题

#### 1. 所有RPC都返回429错误
**原因**: 请求过于频繁，触发速率限制
**解决**: 
- 增加更多RPC端点
- 使用付费私有RPC（更高限额）
- 降低请求频率（调整batch interval）

#### 2. 某个RPC特别慢
**原因**: 节点负载高或网络延迟
**解决**: 
- 从配置中移除该URL
- 更换其他RPC服务商

#### 3. Failover不工作
**原因**: 所有RPC都失败或配置错误
**解决**: 
- 检查每个URL是否可访问
- 确认API key是否有效
- 查看服务器日志

## 性能调优

### 批处理设置

配合RPC负载均衡，优化批处理参数：

```sql
-- 增加批次大小（有多个RPC支持）
UPDATE system_settings SET value = '20' WHERE key = 'payment_batch_size';
UPDATE system_settings SET value = '100' WHERE key = 'max_batch_size';

-- 缩短处理间隔（吞吐量更高）
UPDATE system_settings SET value = '3000' WHERE key = 'payment_batch_interval_ms';
UPDATE system_settings SET value = '5' WHERE key = 'batch_interval_seconds';
```

### 监控指标

关注以下指标判断是否需要更多RPC：

- RPC请求失败率 > 5%
- 平均响应时间 > 2秒
- 429错误频繁出现
- Queue积压严重

## 安全考虑

### API Key管理

```bash
# ✅ 好：每个服务商使用不同的key
BASE_RPC_URL=https://alchemy.com/v2/KEY1,https://infura.io/v3/KEY2

# ❌ 差：暴露key在多个地方
BASE_RPC_URL=https://alchemy.com/v2/SAME_KEY,https://alchemy.com/v2/SAME_KEY
```

### 速率限制

即使使用多RPC，仍要遵守每个服务商的限制：

| 服务商 | 免费限额 | 付费起步 |
|--------|----------|----------|
| Alchemy | 300M CU/月 | $49/月 |
| Infura | 100k req/天 | $50/月 |
| QuickNode | - | $9/月 |

## 未来改进

计划中的功能：

- [ ] 基于延迟的智能路由
- [ ] RPC健康检查和自动剔除
- [ ] 详细的RPC性能统计
- [ ] 动态权重分配

---

**版本**: 1.0  
**更新**: 2025-10-30  
**适用**: server/index-multi-token.ts, server/lp-deployer-standalone.ts

