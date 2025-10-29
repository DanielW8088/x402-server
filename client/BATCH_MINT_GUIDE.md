# Batch Mint 使用指南

这个工具可以使用助记词生成多个钱包地址，并批量进行 x402 token mint。

## 功能

1. ✅ 从助记词生成1000个地址
2. ✅ 存储在本地 SQLite 数据库
3. ✅ 手动读取每个地址的 USDC 余额（不自动刷新）
4. ✅ 批量 mint，支持指定 ID 范围、次数和延迟
5. ✅ 使用传统 EIP-3009 协议（gasless）
6. ✅ 自动跳过余额为0的钱包
7. ✅ 根据余额计算每个钱包最大 mint 次数
8. ✅ 记录每个钱包的 mint 次数，防止超额

## 安装依赖

```bash
npm install
```

## 配置

在 `.env` 文件中添加助记词：

```env
NETWORK=base-sepolia
MNEMONIC=word1 word2 word3 ... word12
SERVER_URL=http://localhost:4021
TOKEN_ADDRESS=0x...

# RPC URL (可选，使用公共RPC如果未设置)
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
BASE_RPC_URL=https://mainnet.base.org
# 或使用自己的RPC (Alchemy, Infura等)
# BASE_SEPOLIA_RPC_URL=https://base-sepolia.g.alchemy.com/v2/YOUR_KEY
```

## 使用步骤

### 工作流程概览

```
1. 生成钱包 → 2. 手动扫描余额 → 3. 批量mint
                      ↓
              （余额存储在数据库）
                      ↓
              （根据余额自动计算每个钱包能mint多少次）
                      ↓
              （余额为0的钱包自动跳过）
```

### 1. 生成钱包地址

生成1000个地址（默认）：
```bash
npm run batch generate
```

生成指定数量的地址：
```bash
npm run batch generate 500
```

地址保存在 `wallets.db` 数据库中。

### 2. 获取 USDC 余额（手动运行）

**⚠️ 重要：余额扫描是手动的，每次批量 mint 前需要手动更新！**

为所有钱包获取 USDC 余额：
```bash
npm run batch fetch-balances
```

这会从链上读取每个地址的 USDC 余额并保存到数据库。

**批量 mint 不会自动刷新余额，请在每次运行前手动执行此命令！**

### 3. 查看统计信息

```bash
npm run batch stats
```

显示：
- 总钱包数
- 有余额的钱包数
- 总 USDC 余额

### 4. 列出钱包

列出所有钱包：
```bash
npm run batch list
```

列出前10个钱包：
```bash
npm run batch list 10
```

列出10个钱包，从第20个开始：
```bash
npm run batch list 10 20
```

### 5. 批量 Mint

**⚠️ 重要特性：**
- ✅ 只从数据库读取余额（不会实时查询链上）
- ✅ 自动跳过余额为0的钱包
- ✅ 根据余额自动计算每个钱包最多能mint多少次
- ✅ 记录每个钱包已经mint的次数
- ✅ 当钱包用完所有mint次数后，自动标记为已用完
- ❌ 不会自动刷新余额（需要手动运行 `fetch-balances`）

#### 并发模式（推荐）⚡

使用 ID 1-100 的钱包，总共 mint 1000次，10个并发worker：
```bash
npm run batch concurrent 1 100 1000 10 1000
                      │   │   │    │    │  └─ ⑤ 延迟(ms)
                      │   │   │    │    └──── ④ 并发数
                      │   │   │    └───────── ③ 总mint次数
                      │   │   └────────────── ② 结束钱包ID
                      │   └────────────────── ① 起始钱包ID
                      └────────────────────── 命令
```

**工作原理：**
- 从钱包池中循环选择钱包
- 每个钱包最多mint `balance / price` 次
- 钱包用完后自动标记为已耗尽
- 所有钱包都用完后停止

参数说明：
- `1`: 起始钱包 ID
- `100`: 结束钱包 ID
- `1000`: 总mint次数
- `10`: 并发worker数量（可选，默认10）
- `1000`: 每次mint间隔毫秒（可选，默认1000）

**特点**：
- 多个钱包同时mint，速度快
- 自动检测余额，USDC不足自动切换钱包
- 智能失败重试机制

#### 串行模式（测试用）

让 ID 1-10 的钱包各 mint 5次，每次间隔2秒：
```bash
npm run batch mint 1 10 5 2000
```

参数说明：
- `1`: 起始钱包 ID
- `10`: 结束钱包 ID
- `5`: 每个钱包 mint 次数
- `2000`: 每次 mint 之间的延迟（毫秒，可选，默认1000）

## 数据库结构

`wallets.db` 包含以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER | 钱包 ID (主键，自增) |
| address_index | INTEGER | 地址索引 (BIP44 派生路径索引) |
| address | TEXT | 钱包地址 |
| private_key | TEXT | 私钥 (hex 格式) |
| usdc_balance | TEXT | USDC 余额 (6 decimals) |
| last_balance_update | INTEGER | 最后更新时间戳 |
| created_at | INTEGER | 创建时间戳 |

**⚠️ 安全警告**：数据库包含所有钱包的私钥，请务必妥善保管！

## 命令参考

```bash
# 生成钱包
npm run batch generate [count]

# 获取余额
npm run batch fetch-balances

# 查看统计
npm run batch stats

# 列出钱包
npm run batch list [limit] [offset]

# 串行批量 mint
npm run batch mint <start_id> <end_id> <times> [delay_ms]

# 并发批量 mint（推荐）⚡
npm run batch concurrent <start_id> <end_id> <total_mints> [workers] [delay_ms]
```

## 注意事项

1. **使用 x402 协议**：不是直接支付方式，通过 x402-fetch 自动处理支付证明
2. **无需 gas**：客户端不发送链上交易，只需要签名支付证明
3. **USDC 余额**：确保钱包有足够的 USDC（虽然不直接消费，但会被 facilitator 检查）
4. **延迟设置**：建议设置合理的延迟避免请求过快
5. **数据库安全**：`wallets.db` 包含所有私钥，请妥善保管，不要泄露或提交到 git

## 示例工作流

```bash
# 1. 生成1000个钱包
npm run batch generate 1000

# 2. 获取所有余额
npm run batch fetch-balances

# 3. 查看统计
npm run batch stats

# 4. 列出前20个有余额的钱包
npm run batch list 20

# 5a. 并发模式：1-100号钱包，mint 1000次（推荐）⚡
npm run batch concurrent 1 100 1000 10 1000

# 5b. 串行模式：前50个钱包各mint 3次（测试用）
npm run batch mint 1 50 3 1000
```

## 故障排查

### 生成钱包失败
- 检查 MNEMONIC 是否正确配置
- 确保助记词格式正确（12个单词，空格分隔）

### 获取余额失败
- 检查网络配置（NETWORK）
- 确保 RPC 节点可访问
- 检查 USDC 合约地址是否正确

### Mint 失败
- 检查 SERVER_URL 是否可访问
- 确认 TOKEN_ADDRESS 正确
- 查看钱包是否有足够 USDC
- 检查服务器日志

## 安全建议

1. 不要将 `.env` 文件提交到 git
2. 不要分享 `wallets.db` 数据库文件
3. 定期备份数据库
4. 在测试网测试后再在主网使用

