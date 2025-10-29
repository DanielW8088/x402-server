# 快速开始

## 1. 配置环境

创建 `.env` 文件：

```bash
cp env.x402.example .env
```

编辑 `.env`，填入你的助记词：

```env
NETWORK=base-sepolia
MNEMONIC=your twelve word mnemonic phrase goes here like this example
SERVER_URL=http://localhost:4021
TOKEN_ADDRESS=0x你的token地址
```

## 2. 生成钱包

```bash
npm run batch generate 1000
```

输出示例：
```
📝 Generating 1000 wallets from mnemonic...
   Generated 100/1000 wallets...
   Generated 200/1000 wallets...
   ...
✅ Generated and saved 1000 wallets to database

📊 Wallet Statistics:
   Total wallets: 1000
   Wallets with USDC: 0
   Total USDC: 0 USDC
```

## 3. 获取余额

```bash
npm run batch fetch-balances
```

这会读取每个地址的链上 USDC 余额。

## 4. 查看钱包

```bash
# 查看统计
npm run batch stats

# 列出前20个钱包
npm run batch list 20
```

## 5. 批量 Mint

### 5a. 串行模式（Sequential）

让 ID 1-10 的钱包各 mint 3次，间隔2秒：

```bash
npm run batch mint 1 10 3 2000
```

### 5b. 并发模式（Concurrent）⚡ 推荐

让 ID 1-100 的钱包，执行总共 1000 次 mint，10个worker并发：

```bash
npm run batch concurrent 1 100 1000 10 1000
```

**参数说明**：
- `1 100`: 使用ID 1-100的钱包
- `1000`: 总共mint 1000次
- `10`: 10个并发worker
- `1000`: 每次mint间隔1秒

**智能特性**：
- ✅ 自动检测余额，USDC不足自动切换钱包
- ✅ 10个钱包同时工作，速度快10倍
- ✅ 失败重试，自动跳过有问题的钱包
- ✅ 实时进度显示

系统会显示确认提示：
```
🚀 Concurrent Batch Mint Configuration:
   Wallet IDs: 1 to 100
   Total mints: 1000
   Concurrent workers: 10
   Delay between mints: 1000ms
   Min USDC balance: 0.1 USDC
   Token: 0x...
   Network: base-sepolia

   Total wallets: 100
   Wallets with sufficient balance: 85

⚠️  Continue with concurrent batch mint? (yes/no): yes
```

输入 `yes` 开始批量 mint。

## 实时输出示例

### 串行模式输出：
```
📍 Wallet #1 (0x1234...)
   Balance: 10.5 USDC
   Mint 1/3...
   ✅ Queued: queue-id-123
   Mint 2/3...
   ✅ Queued: queue-id-124
   ...
```

### 并发模式输出：
```
💼 Worker 0: Using wallet #1 (0x1234...)
   ✅ Worker 0: Queued queue-id-123
   📊 Progress: 1/1000 (1 success, 0 failed)

💼 Worker 1: Using wallet #2 (0x5678...)
   ✅ Worker 1: Queued queue-id-124
   📊 Progress: 2/1000 (2 success, 0 failed)

💼 Worker 2: Using wallet #3 (0xabcd...)
   ✅ Worker 2: Minted 0xdef...
   📊 Progress: 3/1000 (3 success, 0 failed)
   
...（10个worker同时工作）

==========================================================
✨ Concurrent batch mint completed!
   Success: 987
   Failed: 13
   Total: 1000
   Wallets used: 25
```

## 常用命令速查

```bash
# 生成500个钱包
npm run batch generate 500

# 获取余额
npm run batch fetch-balances

# 查看统计
npm run batch stats

# 列出钱包（limit 20, offset 0）
npm run batch list 20

# ===== 串行模式（慢，但适合测试）=====
# 让 1-50 号钱包各mint 5次，间隔1秒
npm run batch mint 1 50 5 1000

# ===== 并发模式（快，推荐用于生产）⚡ =====
# 1-100号钱包，总共mint 1000次，10个并发
npm run batch concurrent 1 100 1000 10 1000

# 1-500号钱包，总共mint 5000次，20个并发，间隔500ms
npm run batch concurrent 1 500 5000 20 500

# 全部1000个钱包，mint 10000次，10个并发
npm run batch concurrent 1 1000 10000 10 1000
```

## 注意事项

1. **首次运行**必须先 `generate` 生成钱包
2. 建议定期运行 `fetch-balances` 更新余额
3. 延迟时间单位是毫秒（1000ms = 1秒）
4. 使用 x402 协议，客户端不直接消费 USDC
5. 数据库文件 `wallets.db` 包含所有私钥，请妥善保管

