# x402 批量 Mint 工具

使用 x402 协议进行批量 mint 的工具。与传统 EIP-3009 模式相比，x402 通过 facilitator 进行支付，不会有 nonce 冲突问题。

## 功能特点

✅ **x402 支付** - 通过 facilitator 处理支付，无 nonce 冲突  
✅ **并发处理** - 多 worker 并发 mint，大幅提升速度  
✅ **自动钱包管理** - 加密存储私钥，自动轮换钱包  
✅ **余额感知** - 根据 USDC 余额智能分配 mint 任务  
✅ **失败重试** - 自动跳过失败钱包，继续处理  

## 快速开始

### 1. 安装依赖

```bash
cd client
npm install
```

### 2. 配置环境变量

创建 `.env` 文件：

```bash
# 加密密码 (必需 - 用于加密私钥)
ENCRYPTION_PASSWORD=your_secure_password_here

# 助记词 (仅生成钱包时需要)
MNEMONIC="your twelve word mnemonic phrase here"

# 服务端 URL
SERVER_URL=http://localhost:4021

# 网络 (base-sepolia 或 base)
NETWORK=base-sepolia

# Token 地址 (mint 时需要)
TOKEN_ADDRESS=0x...

# RPC URLs (可选，支持多个用于负载均衡)
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASE_SEPOLIA_RPC_URL_2=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY
BASE_SEPOLIA_RPC_URL_3=https://base-sepolia.infura.io/v3/YOUR_KEY
```

### 3. 生成钱包

```bash
npm run x402 generate 1000
```

这会：
- 从助记词派生 1000 个钱包
- 加密私钥并存入 `wallets.db`
- 助记词只在生成时使用，后续不再需要

### 4. 给钱包转 USDC

给生成的钱包地址转入 USDC（用于支付 mint 费用）

### 5. 更新余额

```bash
npm run x402 fetch-balances
```

可选参数：
- `batch`: 并发数量 (默认 20)
- `delay`: 请求延迟 ms (默认 100)

示例：
```bash
npm run x402 fetch-balances 50 50  # 50 并发，50ms 延迟
```

### 6. 检查 Token 价格

```bash
npm run x402 check-price
```

### 7. 测试单个钱包

```bash
npm run x402 test 1
```

### 8. 开始批量 Mint

```bash
npm run x402 concurrent --start 0 --end 999 --total 1000 --workers 10 --quantity 10
```

参数说明：
- `--start`: 起始钱包索引 (必需)
- `--end`: 结束钱包索引 (必需)
- `--total`: 总 mint 请求数 (必需)
- `--workers`: 并发 worker 数量 (默认 10)
- `--delay`: 请求间隔 ms (默认 1000)
- `--quantity`: 每次 mint 的 token 数量 (默认 10，最大 10)

## 命令列表

```bash
# 生成钱包
npm run x402 generate [count]

# 获取余额
npm run x402 fetch-balances [batch] [delay]

# 查看统计
npm run x402 stats

# 检查价格
npm run x402 check-price

# 测试单个钱包
npm run x402 test <wallet_id>

# 批量 mint (并发模式)
npm run x402 concurrent --start 0 --end 999 --total 1000
```

## x402 vs 传统模式

| 特性 | x402 模式 | 传统 EIP-3009 模式 |
|-----|----------|-----------------|
| 支付方式 | facilitator 结算 | 直接链上 transferWithAuthorization |
| Nonce 管理 | facilitator 处理 | 需要本地 NonceManager |
| 并发安全 | ✅ 完全安全 | ⚠️ 需要仔细管理 |
| x402scan 索引 | ✅ 是 | ❌ 否 |
| 生态集成 | ✅ 标准 x402 流程 | ❌ 自定义 |
| 性能 | 快 (无 nonce 冲突) | 慢 (串行或复杂 nonce 管理) |

## 工作流程

1. **初始请求** - POST `/api/mint/:address` (不带支付)
   - 服务器返回 402 + `X-PAYMENT-REQUEST` header

2. **创建支付** - 使用 x402 SDK 的 `pay()` 函数
   - 创建 EIP-3009 签名
   - facilitator 验证签名
   - 返回 payment payload

3. **重试请求** - POST `/api/mint/:address` (带 `X-PAYMENT` header)
   - 服务器通过 facilitator 结算支付
   - 将 mint 加入队列
   - 返回 queue ID

4. **异步处理** - 服务器后台处理 mint 队列
   - 批量处理 mint 交易
   - 更新状态

## 性能优化

### 并发设置

```bash
# 保守 (适合公共 RPC)
npm run x402 concurrent --start 0 --end 999 --total 1000 --workers 5 --delay 2000

# 平衡 (推荐)
npm run x402 concurrent --start 0 --end 999 --total 1000 --workers 10 --delay 1000

# 激进 (需要私有 RPC)
npm run x402 concurrent --start 0 --end 999 --total 1000 --workers 20 --delay 500
```

### RPC 负载均衡

配置多个 RPC 端点，自动轮换和重试：

```bash
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASE_SEPOLIA_RPC_URL_2=https://base-sepolia.g.alchemy.com/v2/KEY1
BASE_SEPOLIA_RPC_URL_3=https://base-sepolia.infura.io/v3/KEY2
```

## 故障排查

### 问题：钱包余额不足

```bash
# 更新余额查看实际余额
npm run x402 fetch-balances
npm run x402 stats

# 给钱包转更多 USDC
# 然后重新运行
```

### 问题：部分 mint 失败

工具会自动：
- 标记失败次数 >= 3 的钱包
- 跳过这些钱包，继续其他钱包
- 在最后显示详细统计

### 问题：x402 支付失败

检查：
1. 钱包有足够的 USDC
2. facilitator 可访问 (https://x402.org/facilitator)
3. 网络连接正常
4. RPC 端点正常

### 问题：数据库锁定

```bash
# 关闭所有运行的实例
pkill -f batch-mint-x402

# 重新运行
npm run x402 concurrent ...
```

## 安全提示

⚠️ **私钥安全**
- 私钥加密存储在 `wallets.db`
- 使用 AES-256-CBC 加密
- 密码存储在 `.env` (不要提交到 git)

⚠️ **助记词**
- 助记词只在生成钱包时需要
- 生成后可以从 `.env` 删除
- 妥善保管助记词备份

⚠️ **数据库备份**
- 定期备份 `wallets.db`
- 包含所有钱包的加密私钥

## 高级用法

### 分批处理大量 mint

```bash
# 第一批：钱包 0-499
npm run x402 concurrent --start 0 --end 499 --total 500 --workers 10

# 第二批：钱包 500-999
npm run x402 concurrent --start 500 --end 999 --total 500 --workers 10
```

### 查看特定钱包使用情况

```bash
# 查看钱包统计
npm run x402 stats

# 更新并查看余额变化
npm run x402 fetch-balances
npm run x402 stats
```

## 性能指标

实测数据 (10 workers, 1000ms delay):
- **吞吐量**: ~10 mint/秒
- **钱包切换**: 自动轮换
- **错误率**: < 1% (取决于网络)
- **并发安全**: ✅ 无 nonce 冲突

## License

MIT

