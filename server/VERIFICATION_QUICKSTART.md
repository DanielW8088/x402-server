# 合约开源验证 - 快速开始

## TL;DR

```bash
# 1. 数据库迁移
npm run db:migrate-verification

# 2. 配置 API Key (在 contracts/.env)
echo "BASESCAN_API_KEY=你的密钥" >> ../contracts/.env

# 3. 批量验证所有合约
npm run verify

# 4. 查看验证状态
npm run check-verification
```

## 完整流程

### 步骤 1: 数据库迁移

添加验证所需的字段到数据库：

```bash
cd server
npm run db:migrate-verification
```

成功后会添加这些字段：
- `constructor_args` - 构造函数参数（JSON）
- `compiler_version` - 编译器版本
- `optimization_runs` - 优化次数
- `via_ir` - Via IR 设置
- `verification_status` - 验证状态
- `verification_guid` - 验证 GUID
- `verified_at` - 验证时间
- `verification_error` - 错误信息

### 步骤 2: 获取 Basescan API Key

1. 访问 https://basescan.org/myapikey
2. 登录/注册账号
3. 创建 API Key
4. 复制密钥

### 步骤 3: 配置环境变量

在 `contracts/.env` 中添加：

```bash
BASESCAN_API_KEY=ABCDEFG1234567890
```

### 步骤 4: 查看待验证合约

```bash
npm run check-verification
```

输出示例：
```
📊 CONTRACT VERIFICATION STATUS
================================================================================

📈 Statistics by Network:
────────────────────────────────────────────────────────────────────────────────

base:
  Total:     25
  ✅ Verified: 20 (80%)
  ⏳ Pending:  3
  🔄 Verifying: 0
  ❌ Failed:   2

❗ Unverified Contracts (up to 20):
────────────────────────────────────────────────────────────────────────────────

1. MyToken (MTK)
   Address: 0x1234...
   Network: base
   Status:  pending
   Created: 2024-01-15 10:30:00
   Explorer: https://basescan.org/address/0x1234...#code
```

### 步骤 5: 批量验证

```bash
# 验证所有网络
npm run verify

# 只验证 Base Mainnet
npm run verify:base

# 只验证 Base Sepolia
npm run verify:sepolia

# 限制最大重试次数（跳过已失败 3 次以上的）
npm run verify -- --max-retries=3
```

输出示例：
```
🔍 BATCH CONTRACT VERIFICATION
================================================================================

Found 5 unverified tokens

[1/5] Verifying: MyToken (MTK)
   Address: 0x1234...
   Network: base
   Status: pending
   ✅ Success
   GUID: abc123xyz

⏳ Waiting 10s before next verification...

[2/5] Verifying: TestToken (TST)
   Address: 0x5678...
   Network: base
   Status: failed
   Previous attempts: 2
   ❌ Failed: Constructor arguments do not match
   💾 Error saved to database, continuing to next contract...

⏳ Waiting 10s before next verification...

[3/5] Verifying: AnotherToken (ANT)
   ...

📊 VERIFICATION SUMMARY
================================================================================
Total:     5
✅ Success: 3 (60%)
❌ Failed:  2 (40%)
================================================================================

❌ FAILED CONTRACTS DETAIL:
────────────────────────────────────────────────────────────────────────────────

1. TestToken (TST)
   Address: 0x5678...
   Network: base
   Error:   Constructor arguments do not match
   Explorer: https://basescan.org/address/0x5678...#code

💡 Failed contracts are marked in the database.
   Run 'npm run verify' again to retry failed verifications.
   Or check details: npm run check-verification
```

### 步骤 6: 验证单个合约

```bash
npm run verify -- --address=0x1234567890abcdef...
```

## 自动化选项

### 选项 A: 部署后自动验证

修改 `index-multi-token.ts`，在部署成功后添加：

```typescript
// 保存到数据库
await saveDeployedToken(pool, config, deployResult);

// 异步验证（不阻塞响应）
verifyContract(pool, deployResult.address).catch(err => {
  console.error(`Background verification failed:`, err);
});
```

### 选项 B: 定时任务

使用 cron 每小时自动验证：

```bash
# 编辑 crontab
crontab -e

# 添加（调整路径）
0 * * * * cd /path/to/server && npm run verify >> logs/verify.log 2>&1
```

## 常见问题

### Q: 验证失败怎么办？

```bash
# 1. 查看概览
npm run check-verification

# 2. 调试具体合约（查看完整错误和参数）
npm run debug-verification 0x合约地址

# 3. 查看常见错误及解决方案
# 查看 TROUBLESHOOTING.md 文档
```

**常见错误：Etherscan API V1 已弃用**

如果看到 "deprecated V1 endpoint" 错误，说明 hardhat.config.js 需要升级到 V2 格式。
已修复此问题，重新运行 `npm run verify` 即可。

### Q: 如何重试失败的验证？

```bash
# 重新运行验证，脚本会自动处理 failed 状态的合约
npm run verify
```

### Q: 如何手动验证？

```bash
cd contracts

# 从数据库获取 constructor_args
# 然后运行
npx hardhat verify --network base 合约地址 参数1 参数2 ...
```

### Q: 速率限制怎么办？

```bash
# 增加延迟到 20 秒
npm run verify -- --delay=20000
```

## 验证成功检查

1. **Basescan 网页**
   - 访问 https://basescan.org/address/合约地址#code
   - 应该能看到绿色的 ✓ 标记和源代码

2. **数据库查询**
   ```sql
   SELECT address, name, verification_status, verified_at 
   FROM deployed_tokens 
   WHERE address = '0x...';
   ```

3. **API 检查**（如果添加了 API 端点）
   ```bash
   curl http://localhost:3001/api/tokens/0x.../verification
   ```

## 目录结构

```
server/
├── db/
│   └── add-verification-fields.sql    # 数据库迁移
├── scripts/
│   ├── verify-contracts.ts            # 批量验证脚本
│   └── check-verification-status.ts   # 状态查看脚本
├── services/
│   └── tokenDeployer.ts               # 包含验证函数
├── CONTRACT_VERIFICATION.md           # 详细文档
├── VERIFICATION_QUICKSTART.md         # 本文档
└── package.json                        # npm 脚本
```

## 相关命令总结

| 命令 | 说明 |
|------|------|
| `npm run db:migrate-verification` | 数据库迁移 |
| `npm run check-verification` | 查看验证状态 |
| `npm run verify` | 验证所有合约 |
| `npm run verify:base` | 验证 Base Mainnet |
| `npm run verify:sepolia` | 验证 Base Sepolia |
| `npm run verify -- --address=0x...` | 验证指定合约 |
| `npm run verify -- --delay=15000` | 自定义延迟（毫秒） |
| `npm run verify -- --max-retries=3` | 限制最大重试次数 |

### 常用组合

```bash
# 安全模式：慢速验证，跳过已失败多次的
npm run verify:base -- --delay=20000 --max-retries=3

# 快速重试：只尝试首次失败的
npm run verify -- --max-retries=1

# 深度重试：给所有合约足够机会
npm run verify -- --max-retries=10 --delay=15000
```

## 下一步

- ✅ 数据库迁移完成
- ✅ API Key 配置完成  
- ✅ 验证至少一个合约测试
- ✅ 设置定时任务（可选）
- ✅ 在前端显示验证状态（可选）

完整文档参考：[CONTRACT_VERIFICATION.md](./CONTRACT_VERIFICATION.md)

