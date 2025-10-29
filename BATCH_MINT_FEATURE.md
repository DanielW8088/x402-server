# Batch Mint Feature (批量mint功能)

## 功能概述

用户现在可以一次性mint 10次，支付10倍的USDC，获得10倍的tokens。

## 前端改动

### DynamicMintInterface.tsx

1. **新增状态**:
   - `batchQuantity`: 跟踪当前mint的数量（1或10）

2. **修改函数**:
   - `handleMint(quantity)`: 现在接受quantity参数，计算相应的USDC金额
   - `callX402MintAPI(authorization, quantity)`: 传递quantity到后端

3. **UI改动**:
   - 原来的单个mint按钮改为两个按钮：
     - **Mint 1x**: 单次mint，显示单价（如 "1 USDC"）
     - **Mint 10x**: 批量mint 10次，显示10倍价格（如 "10 USDC"）
   - Mint 10x按钮使用渐变色彩（orange → pink → purple）突出显示

## 后端改动

### server/index-multi-token.ts

1. **新增参数验证**:
   ```typescript
   const quantity = req.body.quantity || 1;
   // 限制: 1-10次
   ```

2. **价格验证**:
   - 修改为 `expectedPrice = basePrice * quantity`
   - 用户必须支付准确的quantity倍USDC

3. **批量队列添加**:
   - 循环添加quantity个mint任务到队列
   - 每个任务使用不同的txHash（基于timestamp + i）
   - 只有第一个mint任务记录paymentTxHash
   - 返回所有queueIds供追踪

4. **供应量检查**:
   - 确保剩余供应量 >= quantity * mintAmountPerPayment

## API更新

### POST /api/mint/:address

**请求体**:
```json
{
  "payer": "0x...",
  "authorization": {
    "from": "0x...",
    "to": "0x...",
    "value": "10000000",  // quantity * price in USDC wei
    "validAfter": "0",
    "validBefore": "...",
    "nonce": "0x...",
    "signature": "0x..."
  },
  "quantity": 10  // 新增: 1-10
}
```

**响应**:
```json
{
  "success": true,
  "message": "Added 10x mints to queue (gasless!)",
  "queueId": "uuid-1",  // 第一个queue ID（向后兼容）
  "queueIds": ["uuid-1", "uuid-2", ..., "uuid-10"],  // 所有queue IDs
  "quantity": 10,
  "payer": "0x...",
  "status": "pending",
  "queuePosition": 5,
  "estimatedWaitSeconds": 50,
  "amount": "1000000000000000000000",  // 总token数量
  "paymentTxHash": "0x..."
}
```

## 用户体验

1. **连接钱包**
2. **选择mint数量**:
   - 点击 "Mint 1x" 进行单次mint
   - 点击 "Mint 10x" 进行批量mint
3. **签名授权**: 
   - 用户只需签名一次（EIP-3009 USDC转账授权）
   - 签名金额为 quantity * price
4. **等待处理**: 
   - 后端自动将10个mint任务加入队列
   - 批量处理更加高效
5. **接收tokens**:
   - 用户将收到10倍的tokens

## 优势

1. **省gas费**: 用户只需签名一次，后端批量处理
2. **效率更高**: 批量队列处理比用户手动点击10次更快
3. **用户友好**: 一键完成多次mint，无需重复操作
4. **支付准确**: 后端严格验证支付金额，防止错误

## 安全性

- ✅ 价格验证: 必须支付准确的 quantity * price
- ✅ 供应量检查: 确保有足够的tokens可mint
- ✅ 防重放: 每个mint使用唯一的txHash
- ✅ 支付验证: 使用EIP-3009标准，安全可靠

## 限制

- 单次最多mint 10次
- 必须有足够的剩余供应量
- 用户必须有足够的USDC余额

