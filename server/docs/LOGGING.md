# 日志管理系统

## 📋 概述

新的日志系统通过环境变量控制日志输出级别，减少生产环境的调试噪音，同时保留开发环境的详细信息。

## 🎯 日志级别

| 级别 | 用途 | 默认环境 |
|------|------|----------|
| **DEBUG** | 详细调试信息、请求/响应详情 | 开发环境 |
| **INFO** | 重要操作消息、成功事件 | 生产环境 |
| **WARN** | 潜在问题、降级操作 | 所有环境 |
| **ERROR** | 实际错误、失败操作 | 所有环境 |
| **SILENT** | 关闭所有日志 | 特殊场景 |

## ⚙️ 配置方法

### 1. 环境变量配置

在 `.env` 文件中设置：

```bash
# 开发环境 - 显示所有日志
NODE_ENV=development
LOG_LEVEL=DEBUG

# 生产环境 - 只显示重要日志
NODE_ENV=production
LOG_LEVEL=INFO

# 完全静默（不推荐）
LOG_LEVEL=SILENT
```

### 2. 默认行为

如果未设置 `LOG_LEVEL`：
- **开发环境** (`NODE_ENV=development`): 自动使用 `DEBUG` 级别
- **生产环境** (`NODE_ENV=production`): 自动使用 `INFO` 级别

## 📝 使用示例

### 基础用法

```typescript
import { log } from './lib/logger.js';

// Debug - 只在开发环境显示
log.debug('Detailed debug information', { data: someData });

// Info - 生产环境也显示
log.info('Operation completed successfully');

// Warning - 总是显示
log.warn('Deprecated API used');

// Error - 总是显示
log.error('Failed to process request', error);
```

### 便捷方法

```typescript
// 支付相关（INFO 级别）
log.payment('Payment received:', txHash);

// Mint 相关（INFO 级别）
log.mint('Minted 10 tokens to:', userAddress);

// 验证相关（INFO 级别）
log.verify('Verifying contract...', contractAddress);

// 成功消息（INFO 级别）
log.success('Deployment completed!');

// 失败消息（ERROR 级别）
log.failure('Mint failed:', errorMessage);

// 启动消息（总是显示）
log.startup('🚀 Server started on port', PORT);
```

## 🔍 日志输出示例

### 开发环境（LOG_LEVEL=DEBUG）

```
[2024-11-01T10:30:45.123Z] [DEBUG] 📦 Request quantity: 5, body: {"quantity":5}
[2024-11-01T10:30:45.234Z] [DEBUG] Expected price: 5000000 wei for quantity 5
[2024-11-01T10:30:45.345Z] [INFO] 🔍 Verifying x402 payment via facilitator
[2024-11-01T10:30:45.456Z] [DEBUG] Payment requirements: {...}
[2024-11-01T10:30:45.567Z] [INFO] ✅ Payment settled via facilitator
```

### 生产环境（LOG_LEVEL=INFO）

```
[2024-11-01T10:30:45.345Z] [INFO] 🔍 Verifying x402 payment via facilitator
[2024-11-01T10:30:45.567Z] [INFO] ✅ Payment settled via facilitator
```

## 📊 日志级别对比

### 开发环境 vs 生产环境

| 操作 | 开发环境 | 生产环境 |
|------|----------|----------|
| 启动消息 | ✅ 显示 | ✅ 显示 |
| RPC 配置 | ✅ 详细 | ✅ 简洁 |
| 请求详情 | ✅ 完整 body | ❌ 隐藏 |
| 支付验证 | ✅ 详细参数 | ✅ 简要状态 |
| 支付结算 | ✅ 完整响应 | ✅ 结果状态 |
| 队列操作 | ✅ 每步详情 | ✅ 关键事件 |
| 错误信息 | ✅ 完整栈 | ✅ 完整栈 |
| 警告信息 | ✅ 显示 | ✅ 显示 |

## 🎨 日志格式

所有日志包含：
- **时间戳**: ISO 8601 格式
- **级别**: DEBUG/INFO/WARN/ERROR
- **消息**: 可读的操作描述
- **数据**: JSON 格式的附加信息（可选）

```
[2024-11-01T10:30:45.123Z] [INFO] 💰 Payment received: 0xabc...def
```

## 📈 性能影响

### DEBUG 级别
- **日志量**: 高（每个请求 10-20 条日志）
- **性能影响**: 轻微（约 1-2% CPU）
- **适用场景**: 开发、调试

### INFO 级别
- **日志量**: 中（每个请求 3-5 条日志）
- **性能影响**: 可忽略（< 0.5% CPU）
- **适用场景**: 生产环境

### WARN/ERROR 级别
- **日志量**: 低（仅异常情况）
- **性能影响**: 几乎无
- **适用场景**: 高负载生产环境

## 🛠️ 故障排查

### 问题：生产环境日志太多

**解决方案**：
```bash
# 方法 1: 设置更高的日志级别
LOG_LEVEL=WARN

# 方法 2: 只记录错误
LOG_LEVEL=ERROR

# 方法 3: 完全静默（不推荐）
LOG_LEVEL=SILENT
```

### 问题：需要临时查看详细日志

**解决方案**：
```bash
# 临时启用 DEBUG 级别
LOG_LEVEL=DEBUG npm start

# 或修改 .env 后重启
echo "LOG_LEVEL=DEBUG" >> .env
pm2 restart token-server
```

### 问题：某些日志仍然显示太多

**解决方案**：
修改代码中的日志级别：
```typescript
// 从 log.info 改为 log.debug
log.debug('This will only show in development');
```

## 📦 迁移指南

### 从旧代码迁移

旧代码：
```typescript
console.log('Debug info:', data);
console.log('✅ Success');
console.warn('⚠️ Warning');
console.error('❌ Error:', error);
```

新代码：
```typescript
import { log } from './lib/logger.js';

log.debug('Debug info:', data);
log.success('Success');
log.warn('Warning');
log.error('Error:', error);
```

## 🎯 最佳实践

### 1. 选择正确的日志级别

```typescript
// ❌ 错误 - 调试信息使用 INFO
log.info('Request body:', req.body);

// ✅ 正确 - 调试信息使用 DEBUG
log.debug('Request body:', req.body);

// ✅ 正确 - 重要事件使用 INFO
log.info('Token deployed:', tokenAddress);
```

### 2. 避免敏感信息

```typescript
// ❌ 错误 - 记录私钥
log.debug('Private key:', privateKey);

// ✅ 正确 - 只记录地址
log.debug('Using wallet:', walletAddress);
```

### 3. 结构化日志

```typescript
// ❌ 错误 - 难以解析
log.info(`Minted ${amount} tokens to ${address} at ${timestamp}`);

// ✅ 正确 - 结构化数据
log.info('Token minted', { amount, address, timestamp });
```

### 4. 使用便捷方法

```typescript
// ❌ 一般 - 使用通用方法
log.info('💰 Payment settled:', txHash);

// ✅ 更好 - 使用专用方法
log.payment('Payment settled:', txHash);
```

## 📊 监控建议

### 生产环境监控

1. **日志聚合**
   - 使用 Winston/Pino 发送到 ELK/Datadog
   - 设置告警规则

2. **错误追踪**
   - 集成 Sentry 捕获错误
   - 监控 ERROR 级别日志

3. **性能监控**
   - 使用 Prometheus 收集指标
   - 监控关键操作耗时

## 🔧 高级配置

### 自定义日志级别

在代码中动态调整：
```typescript
import { logger } from './lib/logger.js';

// 检查当前级别
if (logger.isDebugEnabled()) {
  // 执行耗时的调试操作
  const debugInfo = generateDetailedDebugInfo();
  log.debug('Debug info:', debugInfo);
}
```

### 条件日志

```typescript
// 只在特定条件下记录
if (amount > 1000000) {
  log.warn('Large amount detected:', amount);
}

// 使用便捷检查
if (logger.isDebugEnabled()) {
  log.debug('Expensive operation result:', computeExpensiveDebugInfo());
}
```

## 🎉 总结

- ✅ 使用环境变量控制日志级别
- ✅ 开发环境使用 DEBUG，生产环境使用 INFO
- ✅ 选择正确的日志方法（debug/info/warn/error）
- ✅ 使用便捷方法（payment/mint/verify/success/failure）
- ✅ 避免记录敏感信息
- ✅ 生产环境监控 WARN 和 ERROR 日志

日志系统让开发更简单，生产更清爽！ 🚀

