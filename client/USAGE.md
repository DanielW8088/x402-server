# 使用指南

## 快速开始

### 1. 配置环境

```bash
# 复制配置模板
cp .env.example .env

# 编辑配置文件，填入你的私钥
nano .env
```

### 2. 运行客户端

```bash
npm start
```

## 完整示例

### 场景：在 Base Sepolia 测试网 mint 代币

**准备工作：**

1. 获取测试 ETH（用于 gas）
   - [Base Sepolia Faucet](https://portal.cdp.coinbase.com/products/faucet)

2. 获取测试 USDC
   - 在 Uniswap 测试网用 ETH swap USDC
   - USDC 地址：`0x036CbD53842c5426634e7929541eC2318f3dCF7e`

3. 确保服务器在运行
   ```bash
   # 在另一个终端
   cd ../server
   npm start
   ```

**执行 mint：**

```bash
# 在 client 目录
npm start
```

**预期输出：**

```
🚀 Token Mint Client
====================

Network: base-sepolia
Your address: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2
Server: http://localhost:4021

📋 Step 1: Getting server info...
   Token contract: 0x1234567890123456789012345678901234567890
   Pay to address: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2
   Tokens per payment: 10000
   Remaining supply: 990000

💰 Step 2: Sending 1 USDC payment...
💸 Sending 1 USDC to 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2...
   Your USDC balance: 10.5 USDC
   Transaction hash: 0xabc123...
   Waiting for confirmation...
   ✅ USDC transfer confirmed at block 12345

🎨 Step 3: Minting tokens...
🎫 Requesting token mint from server...

✨ SUCCESS! Tokens minted!
============================
Payer: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2
Amount: 10000 tokens
Payment TX: 0xabc123...
Mint TX: 0xdef456...
Block: 12346

🎉 All done!
```

## 手动操作示例

如果不想自动发送 USDC，可以手动操作：

### 1. 不配置 USDC_CONTRACT_ADDRESS

```bash
# .env 文件中注释掉或删除这一行
# USDC_CONTRACT_ADDRESS=0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

### 2. 运行客户端查看支付地址

```bash
npm start
```

会输出：

```
⚠️  USDC_CONTRACT_ADDRESS not configured in .env
   Please manually send USDC and provide the transaction hash.

   Send 1 USDC to: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb2
```

### 3. 手动发送 USDC

使用 MetaMask 或其他钱包：
- 发送 1 USDC 到显示的地址
- 记录交易哈希

### 4. 调用服务器 mint

```bash
curl -X POST http://localhost:4021/mint \
  -H "Content-Type: application/json" \
  -d '{
    "paymentTxHash": "0xYourTransactionHash",
    "payer": "0xYourAddress"
  }'
```

## 脚本化使用

创建一个自动化脚本：

```bash
#!/bin/bash
# mint.sh - Automated minting script

set -e

echo "🚀 Starting automated mint process..."

# Check if server is running
if ! curl -s http://localhost:4021/health > /dev/null; then
    echo "❌ Server is not running!"
    echo "Start the server with: cd ../server && npm start"
    exit 1
fi

# Run the client
npm start

echo "✅ Mint process completed!"
```

使用：

```bash
chmod +x mint.sh
./mint.sh
```

## 使用 @coinbase/cdp-sdk

如果想使用 Coinbase Developer Platform SDK 管理钱包：

### 1. 安装 CDP SDK

```bash
npm install @coinbase/cdp-sdk
```

### 2. 使用 CDP SDK 创建钱包

创建 `create-wallet.ts`：

```typescript
import { Coinbase } from "@coinbase/cdp-sdk";

async function createWallet() {
  const coinbase = new Coinbase({
    apiKeyName: process.env.CDP_API_KEY_NAME!,
    privateKey: process.env.CDP_PRIVATE_KEY!,
  });

  const wallet = await coinbase.createWallet();
  const address = await wallet.getDefaultAddress();
  
  console.log("Wallet Address:", address.getId());
  console.log("Private Key:", wallet.export());
}

createWallet();
```

### 3. 将私钥配置到 .env

```bash
PRIVATE_KEY=<从 CDP SDK 导出的私钥>
```

## 多次 Mint

如果想 mint 多次：

```bash
# 方法 1: 多次运行
npm start
npm start
npm start

# 方法 2: 使用循环
for i in {1..5}; do
  echo "Mint #$i"
  npm start
  sleep 5
done
```

## 验证代币余额

mint 成功后，验证代币余额：

```bash
# 使用 cast (foundry)
cast call <TOKEN_ADDRESS> \
  "balanceOf(address)(uint256)" \
  <YOUR_ADDRESS> \
  --rpc-url https://sepolia.base.org

# 或者在 Basescan 上查看
# https://sepolia.basescan.org/address/<YOUR_ADDRESS>
```

## 故障排除

### 问题：Insufficient USDC balance

**解决：**
1. 检查 USDC 余额：
   ```bash
   cast call 0x036CbD53842c5426634e7929541eC2318f3dCF7e \
     "balanceOf(address)(uint256)" \
     <YOUR_ADDRESS> \
     --rpc-url https://sepolia.base.org
   ```

2. 获取更多 USDC：
   - 在 Uniswap 上 swap
   - 从水龙头获取

### 问题：Server connection refused

**解决：**
```bash
# 检查服务器状态
curl http://localhost:4021/health

# 如果失败，启动服务器
cd ../server
npm start
```

### 问题：Transaction failed

**解决：**
1. 检查 gas 余额（需要 ETH）
2. 检查网络是否正确
3. 查看交易详情：
   ```bash
   # 在 Basescan 上查看
   https://sepolia.basescan.org/tx/<TX_HASH>
   ```

## 高级用法

### 使用不同的网络

**切换到 Base Mainnet：**

```bash
# .env
NETWORK=base
USDC_CONTRACT_ADDRESS=0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

### 自定义支付金额

```bash
# .env
PAYMENT_AMOUNT_USDC=5  # 支付 5 USDC
```

### 使用自定义 RPC

修改 `index.ts`：

```typescript
const publicClient = createPublicClient({
  chain,
  transport: http(process.env.RPC_URL),
});
```

## API 参考

客户端使用的主要 API：

### GET `/info`

获取服务器信息。

### GET `/health`

健康检查。

### POST `/mint`

请求 mint 代币。

**请求：**
```json
{
  "paymentTxHash": "0x...",
  "payer": "0x..."
}
```

**响应：**
```json
{
  "success": true,
  "message": "Tokens minted successfully",
  "payer": "0x...",
  "amount": "10000000000000000000000",
  "mintTxHash": "0x...",
  "paymentTxHash": "0x...",
  "blockNumber": "12345"
}
```

## 安全提示

1. **永远不要分享私钥**
2. **使用测试网测试**
3. **小额测试后再大额操作**
4. **定期备份私钥**
5. **使用硬件钱包（生产环境）**

## 相关链接

- [Base Sepolia Explorer](https://sepolia.basescan.org)
- [Base Sepolia Faucet](https://portal.cdp.coinbase.com/products/faucet)
- [Uniswap Interface](https://app.uniswap.org)
- [Viem Documentation](https://viem.sh)

