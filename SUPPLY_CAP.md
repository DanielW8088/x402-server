# Token Supply Cap - 1 Billion Tokens

## 概览

合约现在有**1,000,000,000 (10亿)** 代币的硬上限。

## 技术细节

### 合约常量

```solidity
/// @notice Maximum total supply of tokens (1 billion tokens with 18 decimals)
uint256 public constant MAX_SUPPLY = 1_000_000_000 * 10**18;
```

这是一个**constant**，部署后无法修改。

### Mint检查

每次mint前，合约会检查：

```solidity
if (totalSupply() + totalMintAmount > MAX_SUPPLY) {
    revert MaxSupplyExceeded();
}
```

### 计算最大Mint次数

假设每次支付mint **10,000** 代币：

```
最大Mint次数 = 1,000,000,000 / 10,000 = 100,000 次
```

也就是说，最多可以有 **100,000个用户** 支付1 USDC获得代币。

## 查看供应信息

### 通过合约函数

```solidity
// 查看最大供应量
function maxSupply() public pure returns (uint256)

// 查看当前总供应量
function totalSupply() public view returns (uint256)  // ERC20标准

// 查看剩余可mint数量
function remainingSupply() public view returns (uint256)
```

### 通过服务器API

```bash
curl http://localhost:4021/info
```

返回:
```json
{
  "price": "1 USDC",
  "tokensPerPayment": "10000000000000000000000",
  "maxSupply": "1000000000000000000000000000",
  "totalSupply": "0",
  "remainingSupply": "1000000000000000000000000000",
  "maxPossibleMints": "100000",
  "network": "base-sepolia",
  "tokenContract": "0x..."
}
```

### 通过命令行脚本

```bash
cd contracts
npm run status:sepolia
```

输出:
```
📊 Token Information:
   Name: MyToken
   Symbol: MTK
   Decimals: 18
   Total Supply: 0
   Max Supply: 1,000,000,000 (1 billion)
   Remaining Supply: 1,000,000,000
   Supply Used: 0.00%

⚙️  Mint Configuration:
   Mint Amount: 10,000 tokens per payment
   Max Possible Mints: 100,000 (based on remaining supply)
```

## 错误处理

### 达到上限时

当总供应量达到1B时，任何mint尝试都会失败：

**合约错误**:
```solidity
error MaxSupplyExceeded();
```

**服务器响应**:
```json
{
  "error": "Maximum supply reached",
  "remainingSupply": "0",
  "message": "Cannot mint more tokens, supply cap of 1 billion has been reached"
}
```

**HTTP状态码**: `400 Bad Request`

## 供应监控

### 实时监控

服务器在每次mint前检查剩余供应：

```typescript
const remainingSupply = await contract.remainingSupply();
if (remainingSupply < mintAmount) {
  // 拒绝请求
}
```

### 设置告警

建议在剩余供应低于某个阈值时发送告警：

```typescript
// 示例: 剩余不足10%时告警
const threshold = maxSupply * 0.1;
if (remainingSupply < threshold) {
  sendAlert("Token supply is running low!");
}
```

## 供应经济学

### 分发时间线

假设平均每天100次mint：

```
100,000 次 / 100 次/天 = 1,000 天 ≈ 2.7 年
```

### 收入预测

如果每次支付1 USDC：

```
100,000 次 × $1 = $100,000 总收入
```

减去gas费用（约$0.0002/次）：

```
100,000 次 × $0.0002 = $20
$100,000 - $20 = $99,980 净收入
```

### 调整策略

如果需要更长的分发期：

**选项1: 增加价格**
```typescript
// server/index.ts
price: "$5"  // 5 USDC instead of 1
```

**选项2: 减少每次mint数量**
```javascript
// contracts/scripts/deploy.js
const MINT_AMOUNT = hre.ethers.parseEther("5000"); // 5,000 instead of 10,000
// 最大Mint次数 = 1B / 5,000 = 200,000 次
```

**选项3: 部署新合约**
```javascript
// 增加供应上限需要部署新合约
// 在新合约中修改 MAX_SUPPLY
```

## 供应上限的好处

### 1. 稀缺性
- 限定供应量创造稀缺性
- 有助于维持代币价值

### 2. 透明度
- 用户知道最大供应量
- 无法意外或恶意超发

### 3. 信任
- Constant无法修改
- 完全去中心化的保证

### 4. 经济模型清晰
- 可预测的分发时间线
- 明确的收入预期

## 检查清单

部署前确认：

- [ ] MAX_SUPPLY设置正确 (1B)
- [ ] MINT_AMOUNT设置合理
- [ ] 计算最大Mint次数
- [ ] 服务器正确处理MaxSupplyExceeded
- [ ] 设置供应监控和告警
- [ ] 文档化供应经济模型

## 示例场景

### 场景1: 正常Mint

```
当前供应: 100,000,000
Mint数量: 10,000
剩余供应: 900,000,000
✅ Mint成功
```

### 场景2: 接近上限

```
当前供应: 999,990,000
Mint数量: 10,000
剩余供应: 10,000
✅ Mint成功 (最后一次)
```

### 场景3: 达到上限

```
当前供应: 1,000,000,000
Mint数量: 10,000
剩余供应: 0
❌ MaxSupplyExceeded
```

### 场景4: 批量Mint检查

```
当前供应: 999,980,000
批量Mint: 3个地址 × 10,000 = 30,000
剩余供应: 20,000
❌ MaxSupplyExceeded (不足以mint 3个)
```

## 代码示例

### 检查剩余供应

```typescript
// 客户端检查
const response = await fetch("http://localhost:4021/info");
const { remainingSupply, maxPossibleMints } = await response.json();

console.log(`还可以mint ${maxPossibleMints} 次`);
```

### 合约直接调用

```typescript
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

const remainingSupply = await client.readContract({
  address: "0x...",
  abi: tokenAbi,
  functionName: "remainingSupply",
});

console.log(`剩余供应: ${remainingSupply.toString()}`);
```

## 总结

- ✅ **硬上限**: 1,000,000,000 代币（无法修改）
- ✅ **自动检查**: 每次mint前验证
- ✅ **透明**: 任何人都可以查询
- ✅ **安全**: 防止超发
- ✅ **灵活**: 可以调整每次mint数量和价格

供应上限确保了代币经济的稳定性和可预测性，同时保护了早期参与者的利益。

