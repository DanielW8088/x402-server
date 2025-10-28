# 安全修复：支付地址验证

## 修复内容

在 `POST /api/mint/:address` 接口中添加了支付地址验证，确保用户的 USDC 只能发送到正确的 token 合约地址。

## 问题描述

**之前的代码：**
```typescript
// ❌ 缺少验证
const authHash = await walletClient.writeContract({
  functionName: "transferWithAuthorization",
  args: [
    getAddress(authorization.from),
    getAddress(authorization.to),  // 直接使用，没验证！
    ...
  ],
});
```

**风险：**
- 如果前端代码错误或被篡改，`authorization.to` 可能不是 token 合约地址
- 用户的 USDC 可能被发送到错误的地址
- 用户支付了但无法 mint token

## 修复方案

**修复后的代码：**
```typescript
// ✅ 添加验证
// Verify authorization is to the correct token contract address
if (getAddress(authorization.to) !== getAddress(tokenAddress)) {
  console.error(`❌ Invalid payment recipient: expected ${tokenAddress}, got ${authorization.to}`);
  return res.status(400).json({
    error: "Invalid payment recipient",
    message: `Payment must be sent to token contract ${tokenAddress}, but was sent to ${authorization.to}`,
  });
}

console.log(`✅ Payment recipient verified: ${tokenAddress}`);

// Execute transferWithAuthorization
const authHash = await walletClient.writeContract({
  ...
});
```

## 验证流程

1. **用户请求 mint:** `POST /api/mint/0xTokenAddress`
2. **前端传递授权：** 
   ```json
   {
     "authorization": {
       "from": "0xUserAddress",
       "to": "0xTokenAddress",  // ← 必须等于 URL 中的 token 地址
       "value": "1000000",
       "signature": "0x..."
     }
   }
   ```
3. **服务端验证：**
   ```typescript
   if (authorization.to !== tokenAddress) {
     return 400 Error
   }
   ```
4. **执行转账：** 只有验证通过才执行 USDC 转账

## 影响范围

- **文件：** `server/index-multi-token.ts`
- **位置：** 第 649-658 行
- **接口：** `POST /api/mint/:address`
- **模式：** Gasless mode (使用 EIP-3009 transferWithAuthorization)

## 测试场景

### ✅ 正常场景
```bash
# 用户 mint token 0xABC...
POST /api/mint/0xABC...
Body: {
  "authorization": {
    "to": "0xABC...",  # 正确的 token 地址
    ...
  }
}

# 结果：✅ 验证通过，USDC 转账到 0xABC...，用户获得 token
```

### ❌ 错误场景 1：地址不匹配
```bash
POST /api/mint/0xABC...
Body: {
  "authorization": {
    "to": "0xDEF...",  # 错误的地址！
    ...
  }
}

# 结果：❌ 400 Error
{
  "error": "Invalid payment recipient",
  "message": "Payment must be sent to token contract 0xABC..., but was sent to 0xDEF..."
}
```

### ❌ 错误场景 2：前端代码被篡改
```bash
# 恶意前端尝试把 USDC 发到其他地址
POST /api/mint/0xABC...
Body: {
  "authorization": {
    "to": "0xHackerAddress",
    ...
  }
}

# 结果：❌ 400 Error（服务端拒绝）
```

## 与部署费验证对比

项目中已经有类似的验证用于部署费：

```typescript
// POST /api/deploy - 部署费验证
if (getAddress(authorization.to) !== getAddress(account.address)) {
  return res.status(400).json({
    error: "Invalid payment recipient",
    message: `Payment must be sent to ${account.address}`,
  });
}
```

现在 mint 接口也有同样的保护：

```typescript
// POST /api/mint/:address - Mint 支付验证
if (getAddress(authorization.to) !== getAddress(tokenAddress)) {
  return res.status(400).json({
    error: "Invalid payment recipient",
    message: `Payment must be sent to token contract ${tokenAddress}...`,
  });
}
```

## 日志输出

**成功场景：**
```
POST /api/mint/:address received
🆓 Gasless mint request
✅ Payment recipient verified: 0xABC123...
✅ USDC transfer executed: 0x789def...
✅ Added to queue: uuid-1234
```

**失败场景：**
```
POST /api/mint/:address received
🆓 Gasless mint request
❌ Invalid payment recipient: expected 0xABC123..., got 0xWrongAddr...
```

## 安全性提升

✅ **防止地址错误** - 用户无法误操作  
✅ **防止前端漏洞** - 即使前端被攻击，服务端也会拒绝  
✅ **清晰的错误提示** - 用户能明确知道问题所在  
✅ **日志记录** - 便于排查问题和监控异常  

## 部署注意事项

1. **编译：** `npm run build`
2. **重启：** `pm2 restart server`
3. **测试：** 使用正确和错误的地址测试 mint 接口
4. **监控：** 查看日志中是否有 "Invalid payment recipient" 错误

## 兼容性

- ✅ 不影响现有正常功能
- ✅ 只是增加了额外的安全验证
- ✅ 向后兼容（正确的请求依然正常工作）
- ✅ 前端无需修改（前端已经正确传递 `paymentAddress`）

## 总结

这是一个**重要的安全修复**，防止了用户因前端错误或攻击而损失 USDC。

**修复前：** 信任前端传递的地址 ❌  
**修复后：** 服务端强制验证地址 ✅

与队列系统的安全性验证（多人 mint 不同合约）一起，确保了整个系统的健壮性。

