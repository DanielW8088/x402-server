# Nonce 错误排查指南

## 问题症状

```
Deployment failed: Nonce provided for the transaction (26485) is lower than 
the current nonce of the account. Try increasing the nonce...
Details: nonce too low: next nonce 26527, tx nonce 26485
```

## 根本原因

**NonceManager 内存缓存与链上状态不同步**

NonceManager 使用 `'once'` 策略（只在启动时同步 nonce，之后使用内存缓存），在以下情况会失效：

1. **服务重启前**：数据库有卡在 `processing` 状态的记录
2. **只清理数据库**：没有重启服务，NonceManager 还在用旧缓存
3. **多个进程**：同一钱包被多个进程使用（不应该发生）

## 🚀 快速修复

### 方法 1: 快速重启（推荐，最快）

```bash
cd /Users/daniel/code/402/token-mint/server
./quick-restart.sh
```

这会重启服务，NonceManager 自动从链上重新同步。**1 秒恢复**。

### 方法 2: 完整修复（包含清理）

```bash
cd /Users/daniel/code/402/token-mint/server
./fix-nonce.sh
```

这会：
1. 停止服务
2. 清理卡住的 payment_queue 和 mint_queue
3. 重新编译（应用最新修复）
4. 重启服务

**适用于有卡住记录的情况**。

## ⚠️ 重要提示

### ❌ 错误做法

```bash
# 只清理数据库，不重启服务
node reset-payment-stuck.cjs
# ❌ NonceManager 缓存没刷新，nonce 还是错的！
```

### ✅ 正确做法

```bash
# 清理数据库后，必须重启
node reset-payment-stuck.cjs
pm2 restart token-server
# ✅ NonceManager 重新初始化，nonce 正确了
```

或者直接用脚本：

```bash
./fix-nonce.sh  # 自动完成所有步骤
```

## 🔍 验证修复

```bash
pm2 logs token-server --lines 30
```

看到这个说明成功：

```
✅ NonceManager initialized, starting nonce: 26527
🔄 Synced nonce from chain: 26527 (pending)
```

如果看到 `starting nonce` 和链上 `next nonce` 一致，就修复成功了。

## 🛡️ 自动恢复机制

**v1.1 改进**：现在当检测到 nonce 错误时，会自动从链上重新同步：

```typescript
if (error.message?.includes('nonce too low')) {
  console.log(`⚠️  Nonce error detected, resyncing from chain...`);
  await this.nonceManager.syncFromChain();
}
```

**但注意**：
- 当前批次可能还是会失败（因为 nonce 已预分配）
- 下一批次会自动恢复（使用新同步的 nonce）
- **最快恢复方法还是直接重启服务**

## 📊 检查工具

### 查看卡住的支付

```bash
node reset-payment-stuck.cjs
# 不加 AUTO_CONFIRM，只查看不修改
```

### 查看卡住的 mint

```bash
node reset-stuck-processing.cjs
```

### 查看 pending mints

```bash
node query-pending-mints.cjs
```

## 🏗️ 架构说明

### 三个独立钱包

1. **SERVER_PRIVATE_KEY** - 接收 USDC 支付（payment-processor 用）
2. **MINTER_PRIVATE_KEY** - 执行 mint 交易（mint-processor 用）
3. **LP_DEPLOYER_PRIVATE_KEY** - 部署流动性（lp-deployer 用）

每个钱包有自己的 NonceManager，互不冲突。

### NonceManager 策略

- **payment-processor**: `'once'` - 高频，启动时同步一次
- **mint-processor**: `'once'` - 高频，启动时同步一次  
- **lp-deployer**: `'always'` - 低频，每次交易都同步（更安全）

## 🔧 手动检查链上 nonce

```bash
# 使用 cast (foundry)
cast nonce 0x0762E6E23E0E575930263514C5d9bEC6AB1d7f1A --rpc-url https://mainnet.base.org

# 或者用 etherscan
# https://basescan.org/address/0x0762E6E23E0E575930263514C5d9bEC6AB1d7f1A
```

对比服务日志中的 nonce，如果不一致就需要重启。

## 🚨 预防措施

1. **监控日志**：定期检查是否有 nonce 错误
2. **优雅重启**：更新代码后用 `pm2 restart` 而不是 `pm2 reload`
3. **避免手动干预**：不要直接修改数据库状态，用提供的脚本
4. **监控 processing 状态**：如果长时间卡住，说明有问题

## 📝 相关文件

- `queue/nonce-manager.ts` - NonceManager 实现
- `queue/payment-processor.ts` - 支付处理（使用 NonceManager）
- `queue/processor.ts` - Mint 处理（使用 NonceManager）
- `lp-deployer-standalone.ts` - LP 部署（使用 NonceManager）
- `reset-payment-stuck.cjs` - 清理卡住的支付
- `reset-stuck-processing.cjs` - 清理卡住的 mint
- `fix-nonce.sh` - 一键修复脚本
- `quick-restart.sh` - 快速重启脚本

