# Architecture - x402 Token Mint

这个文档详细解释了整个系统的架构设计。

## 概览

```
┌──────────────┐
│   User       │
│   Wallet     │
└──────┬───────┘
       │
       │ 1. POST /mint (no payment)
       ↓
┌──────────────────┐
│   x402 Server    │  ←────────────────────┐
│   (Express)      │                        │
└──────┬───────────┘                        │
       │                                    │
       │ 2. Returns 402 + PaymentRequirements
       ↓                                    │
┌──────────────┐                            │
│   User       │                            │
│   Signs      │                            │
│   EIP-3009   │                            │
└──────┬───────┘                            │
       │                                    │
       │ 3. POST /mint with X-PAYMENT header
       ↓                                    │
┌──────────────────┐                        │
│   x402 Server    │                        │
│   Middleware     │                        │
└──────┬───────────┘                        │
       │                                    │
       │ 4. Verify payment                  │
       ↓                                    │
┌──────────────────┐                        │
│   Facilitator    │                        │
│   (x402.org)     │                        │
└──────┬───────────┘                        │
       │                                    │
       │ 5. Settlement (executes USDC transfer)
       ↓                                    │
┌──────────────────┐                        │
│   Blockchain     │                        │
│   (Base)         │                        │
└──────┬───────────┘                        │
       │                                    │
       │ 6. Returns tx hash                 │
       └────────────────────────────────────┘
       
       │ 7. Server calls mint()
       ↓
┌──────────────────┐
│   MintToken      │
│   Contract       │
└──────┬───────────┘
       │
       │ 8. Mint 10,000 tokens
       ↓
┌──────────────┐
│   User       │
│   Receives   │
│   Tokens     │
└──────────────┘
```

## 组件详解

### 1. 智能合约层 (MintToken.sol)

**职责**:
- ERC20代币功能（transfer, balanceOf等）
- 批量mint功能
- 防重放攻击（txHash追踪）
- 访问控制（只有MINTER_ROLE可以mint）

**关键函数**:
```solidity
// 单个mint
function mint(address to, bytes32 txHash) external onlyRole(MINTER_ROLE)

// 批量mint
function batchMint(address[] memory to, bytes32[] memory txHashes) 
    public onlyRole(MINTER_ROLE)

// 检查是否已mint
mapping(bytes32 => bool) public hasMinted
```

**安全特性**:
- ✅ AccessControl: 只有授权的服务器可以mint
- ✅ 防重放: 同一txHash不能mint两次
- ✅ 限额: 可选的最大mint次数限制

### 2. x402服务器 (Express + x402-express)

**职责**:
- 处理HTTP请求
- x402支付集成
- 调用智能合约mint代币

**核心代码结构**:
```typescript
// x402中间件 - 自动处理支付
app.use(
  paymentMiddleware(
    payTo,                    // 接收USDC的地址
    {
      "POST /mint": {
        price: "$1",          // 1 USDC
        network: "base-sepolia",
      },
    },
    { url: facilitatorUrl }
  ),
);

// Mint端点 - 在支付验证后执行
app.post("/mint", async (req, res) => {
  // 1. 从X-PAYMENT-RESPONSE头获取支付信息
  const { transaction: usdcTxHash, payer } = decodePaymentResponse(req);
  
  // 2. 检查是否已mint
  const alreadyMinted = await contract.hasMinted(usdcTxHash);
  
  // 3. Mint代币
  const hash = await contract.mint(payer, usdcTxHash);
  
  // 4. 返回结果
  return res.json({ success: true, mintTxHash: hash });
});
```

**中间件流程**:
1. 请求到达 → 检查X-PAYMENT头
2. 无支付头 → 返回402状态码 + PaymentRequirements
3. 有支付头 → 解码并验证签名
4. 调用facilitator验证余额
5. 验证通过 → 调用facilitator执行转账
6. 转账成功 → 调用next()执行业务逻辑
7. 业务完成 → 添加X-PAYMENT-RESPONSE头并返回

### 3. x402协议层

#### PaymentRequirements (服务器 → 客户端)
```json
{
  "scheme": "exact",
  "network": "base-sepolia",
  "maxAmountRequired": "1000000",  // 1 USDC (6 decimals)
  "asset": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",  // USDC
  "payTo": "0x209...",  // 收款地址
  "resource": "https://api.example.com/mint",
  "description": "Mint 10,000 tokens for 1 USDC",
  "maxTimeoutSeconds": 120,
  "extra": {
    "name": "USDC",
    "version": "2"
  }
}
```

#### PaymentPayload (客户端 → 服务器)
```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "base-sepolia",
  "payload": {
    "signature": "0x2d6a...",  // EIP-712签名
    "authorization": {
      "from": "0x857...",       // 付款人
      "to": "0x209...",          // 收款人
      "value": "1000000",        // 1 USDC
      "validAfter": "1740672089",
      "validBefore": "1740672154",
      "nonce": "0xf374..."       // 随机nonce
    }
  }
}
```

#### SettlementResponse (服务器 → 客户端)
```json
{
  "success": true,
  "transaction": "0x1234...",    // USDC转账交易hash
  "network": "base-sepolia",
  "payer": "0x857..."
}
```

### 4. Facilitator服务

**职责**:
- 验证支付签名
- 检查余额
- 执行链上转账（gasless）
- 返回交易结果

**API端点**:
```
POST /verify   - 验证支付（不执行）
POST /settle   - 验证并执行支付
GET /supported - 获取支持的网络和方案
```

Coinbase提供的公共facilitator: `https://x402.org/facilitator`

### 5. 客户端 (x402-axios)

**职责**:
- 自动处理402响应
- 生成EIP-3009签名
- 重试带支付的请求

**使用示例**:
```typescript
const client = x402Axios({
  facilitatorUrl: "https://x402.org/facilitator",
  privateKey: "0x...",
});

// 自动处理整个支付流程
const response = await client.post("http://localhost:4021/mint");
```

**内部流程**:
1. 发送普通POST请求
2. 收到402响应 → 解析PaymentRequirements
3. 构造EIP-3009 authorization
4. 用私钥签名 (EIP-712)
5. Base64编码为PaymentPayload
6. 添加X-PAYMENT头重试请求
7. 收到200 + X-PAYMENT-RESPONSE → 完成

## 数据流

### 完整的mint流程

```
1. User -> Client: "我要mint代币"
   
2. Client -> Server: POST /mint
   
3. Server -> Client: 402 Payment Required
   {
     "accepts": [PaymentRequirements]
   }
   
4. Client: 生成EIP-3009签名
   - 构造authorization {from, to, value, validAfter, validBefore, nonce}
   - EIP-712签名
   
5. Client -> Server: POST /mint
   Headers: {
     "X-PAYMENT": "base64(PaymentPayload)"
   }
   
6. Server (Middleware): 解码X-PAYMENT
   
7. Server -> Facilitator: POST /verify
   Body: {paymentPayload, paymentRequirements}
   
8. Facilitator: 验证
   - 检查签名
   - 检查余额
   - 检查金额
   - 模拟交易
   
9. Facilitator -> Server: {isValid: true, payer: "0x..."}
   
10. Server: 执行业务逻辑 (next())
    
11. Server -> Facilitator: POST /settle
    Body: {paymentPayload, paymentRequirements}
    
12. Facilitator -> Blockchain: transferWithAuthorization()
    - 用facilitator的钱包支付gas
    - 执行USDC转账
    
13. Blockchain: USDC从User转到Server的payTo地址
    
14. Facilitator -> Server: {
      success: true,
      transaction: "0xabc...",  // USDC tx hash
      payer: "0x..."
    }
    
15. Server: 从X-PAYMENT-RESPONSE头获取交易信息
    
16. Server -> Contract: mint(payer, usdcTxHash)
    
17. Contract: 
    - 检查hasMinted[usdcTxHash] == false
    - mint 10,000 tokens to payer
    - 标记hasMinted[usdcTxHash] = true
    
18. Server -> Client: 200 OK
    Headers: {
      "X-PAYMENT-RESPONSE": "base64(SettlementResponse)"
    }
    Body: {
      success: true,
      payer: "0x...",
      amount: "10000000000000000000000",
      mintTxHash: "0xdef...",   // Mint tx hash
      usdcTxHash: "0xabc...",   // USDC tx hash
    }
    
19. Client: 显示成功消息
    
20. User: 查看钱包 - 收到10,000代币！
```

## 安全机制

### 1. 防重放攻击

**问题**: 如果服务器处理同一个USDC支付两次怎么办？

**解决方案**:
```solidity
mapping(bytes32 => bool) public hasMinted;

function mint(address to, bytes32 txHash) external onlyRole(MINTER_ROLE) {
    if (hasMinted[txHash]) {
        revert AlreadyMinted(to, txHash);
    }
    hasMinted[txHash] = true;
    _mint(to, MINT_AMOUNT);
}
```

使用USDC交易hash作为唯一标识，确保一次支付只能mint一次。

### 2. 访问控制

**问题**: 谁可以调用mint函数？

**解决方案**:
```solidity
bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

function mint(address to, bytes32 txHash) 
    external 
    onlyRole(MINTER_ROLE)  // 只有授权的地址
{
    // ...
}
```

只有被授予MINTER_ROLE的地址（服务器）可以调用mint。

### 3. 支付验证

**问题**: 如何确保用户真的支付了？

**解决方案**:
1. **EIP-712签名**: 用户用私钥签名，证明授权
2. **余额检查**: Facilitator检查用户是否有足够USDC
3. **链上执行**: transferWithAuthorization在链上原子执行
4. **双重确认**: 服务器只在收到成功的settlementResponse后才mint

### 4. 时间窗口

```typescript
authorization: {
  validAfter: "1740672089",   // 10秒前
  validBefore: "1740672154",  // 65秒后
  // ...
}
```

支付授权有时间限制，过期自动失效，防止授权被永久存储和滥用。

### 5. Nonce随机性

```typescript
nonce: "0xf3746613c2d920b5fdabc0856f2aeb2d4f88ee6037b8cc5d04a71a4462f13480"
```

每个支付使用唯一的随机nonce，EIP-3009合约会拒绝重复的nonce。

## Gas费优化

### 为什么是Gasless？

传统流程:
```
User pays gas -> Contract receives USDC -> Contract mints tokens
问题: 用户需要ETH支付gas，增加摩擦
```

x402流程:
```
User signs authorization (no gas) -> 
Facilitator pays gas for USDC transfer -> 
Server pays gas for minting
问题: 用户体验完美，只需签名！
```

### Gas成本分析

**USDC转账**: Facilitator支付
- transferWithAuthorization: ~60,000 gas
- 在Base上约 $0.0001

**Token Mint**: Server支付  
- mint(): ~50,000 gas
- 在Base上约 $0.00008

**总成本**: ~$0.0002 per mint (服务器成本)
**用户支付**: 1 USDC (服务器收入)
**净利润**: ~$0.9998 per mint

## 可扩展性

### 水平扩展

服务器是无状态的，可以轻松水平扩展：

```
         Load Balancer
              |
    +---------+---------+
    |         |         |
  Server1  Server2  Server3
    |         |         |
    +---------+---------+
              |
         Blockchain
```

### 批量处理

合约支持批量mint以节省gas:

```solidity
function batchMint(address[] memory to, bytes32[] memory txHashes)
```

可以积累多个支付，一次性mint：
```typescript
// 收集100个支付
const recipients = [...];
const txHashes = [...];

// 批量mint (节省~40% gas)
await contract.batchMint(recipients, txHashes);
```

## 监控和维护

### 关键指标

1. **支付成功率**: successful_mints / total_requests
2. **平均延迟**: time(settlement) + time(mint)
3. **Gas使用**: total_gas_spent / total_mints
4. **错误率**: failed_settlements / total_attempts

### 日志记录

```typescript
// 记录每次mint
console.log({
  timestamp: Date.now(),
  payer: payer,
  usdcTxHash: usdcTxHash,
  mintTxHash: hash,
  amount: mintAmount,
  network: network,
});
```

### 告警

设置告警监控：
- Facilitator不可用
- 服务器ETH余额过低（无法支付gas）
- Mint失败率 > 5%
- 响应时间 > 10秒

## 总结

这个架构的优势：

✅ **用户友好**: Gasless，只需签名  
✅ **安全**: 多层防护，防重放  
✅ **高效**: Base L2，低成本  
✅ **可扩展**: 无状态服务器  
✅ **标准化**: 基于x402开放协议  
✅ **简单**: 服务器1行代码集成

这是一个生产级的代币分发系统，可以直接用于实际项目。

