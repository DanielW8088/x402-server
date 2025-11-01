# 🔐 Security Update: Agent Encryption Key Storage

## 日期
2025-11-01

## 更新内容

将 AI Agent 加密密钥 (`agentEncryptionKey`) 从环境变量 (`.env`) 迁移到安全私钥文件中，与其他私钥一起存储。

## 改变原因

- **统一安全管理**: 所有敏感密钥现在统一存储在一个安全文件中
- **更好的安全性**: 私钥文件有严格的权限控制（600）
- **简化部署**: 不需要在多个地方配置密钥
- **一致性**: 与 `serverPrivateKey`, `minterPrivateKey`, `lpDeployerPrivateKey` 存储方式一致

## 更改的文件

### 代码变更
1. `server/config/env.ts` - 加载 `agentEncryptionKey` 从私钥文件
2. `server/lib/encryption.ts` - 使用导入的 `agentEncryptionKey` 而不是 `process.env`

### 配置变更
3. `server/env.multi-token.example` - 更新文档和说明
4. `server/private.key.example` - 新增示例文件，包含 `agentEncryptionKey`

### 文档变更
5. `server/docs/PRIVATE_KEY_SETUP.md` - 添加 `agentEncryptionKey` 说明
6. `server/docs/AI_AGENT_SETUP.md` - 更新设置说明
7. `server/docs/AI_AGENT_README.md` - 更新快速开始指南
8. `server/docs/AI_AGENT_IMPLEMENTATION_SUMMARY.md` - 更新实现总结
9. `server/scripts/generate-agent-key.js` - 更新输出说明

## 迁移指南

### 对于新用户

直接在私钥文件中添加 `agentEncryptionKey`:

```json
{
  "serverPrivateKey": "0x...",
  "minterPrivateKey": "0x...",
  "lpDeployerPrivateKey": "0x...",
  "agentEncryptionKey": "1a2b3c4d5e6f..."
}
```

### 对于现有用户

如果你已经在使用 AI Agent 系统：

1. **找到现有的加密密钥**
   ```bash
   # 从 .env 文件中复制 AGENT_ENCRYPTION_KEY 的值
   grep AGENT_ENCRYPTION_KEY .env
   ```

2. **添加到私钥文件**
   
   **macOS:**
   ```bash
   nano ~/.config/token-mint/private.key
   ```
   
   **Linux:**
   ```bash
   sudo nano /etc/secret/private.key
   ```
   
   添加字段：
   ```json
   {
     "serverPrivateKey": "0x...",
     "minterPrivateKey": "0x...",
     "lpDeployerPrivateKey": "0x...",
     "agentEncryptionKey": "从.env复制的值"
   }
   ```

3. **从 .env 中移除（可选）**
   ```bash
   # 注释掉或删除这一行
   # AGENT_ENCRYPTION_KEY=...
   ```

4. **重启服务**
   ```bash
   npm run dev
   # 或
   pm2 restart token-server
   ```

5. **验证**
   ```bash
   # 检查日志，确保没有错误
   pm2 logs token-server
   
   # 或直接测试
   curl http://localhost:4021/api/ai-agent/wallet/0xYourAddress
   ```

## 向后兼容性

⚠️ **重要：不要修改已有的加密密钥！**

- 必须使用相同的加密密钥，否则无法解密已存储的 agent 钱包私钥
- 如果你已经在使用 AI Agent，确保复制正确的密钥值到私钥文件

## 文件位置

**私钥文件默认位置：**

- **macOS**: `~/.config/token-mint/private.key`
- **Linux**: `/etc/secret/private.key`
- **自定义**: 通过 `PRIVATE_KEY_FILE` 环境变量指定

**权限要求：**
```bash
chmod 600 <private-key-file>
```

## 文件格式

```json
{
  "serverPrivateKey": "0x...",
  "minterPrivateKey": "0x...",
  "lpDeployerPrivateKey": "0x...",
  "agentEncryptionKey": "1a2b3c4d5e6f7890abcdef1234567890fedcba0987654321abcdef1234567890"
}
```

**字段说明：**
- `serverPrivateKey`: 服务器钱包私钥（必需，0x 开头）
- `minterPrivateKey`: Minter 钱包私钥（必需，0x 开头）
- `lpDeployerPrivateKey`: LP Deployer 钱包私钥（必需，0x 开头）
- `agentEncryptionKey`: AI Agent 加密密钥（可选，64 字符 hex，仅使用 AI Agent 时需要）

## 生成新密钥

如果是首次设置：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

或使用脚本：

```bash
node scripts/generate-agent-key.js
```

## 故障排查

### 错误: agentEncryptionKey not loaded from private key file

**原因**: 私钥文件中缺少 `agentEncryptionKey` 字段

**解决**: 在私钥文件中添加该字段

### 错误: Failed to decrypt private key

**原因**: 加密密钥改变了或不正确

**解决**: 确保使用的是之前相同的加密密钥

### 错误: Private key file not found

**原因**: 私钥文件不存在或路径不正确

**解决**: 
1. 检查文件是否存在
2. 检查 `PRIVATE_KEY_FILE` 环境变量
3. 查看 `docs/PRIVATE_KEY_SETUP.md` 了解如何创建

## 更多信息

- 完整私钥设置: `docs/PRIVATE_KEY_SETUP.md`
- AI Agent 设置: `docs/AI_AGENT_SETUP.md`
- 快速开始: `docs/AI_AGENT_README.md`

## 检查清单

迁移前检查：

- [ ] 已备份现有的 `AGENT_ENCRYPTION_KEY` 值（如果有）
- [ ] 私钥文件存在且权限为 600
- [ ] 已添加 `agentEncryptionKey` 到私钥文件
- [ ] JSON 格式正确（可以用 `jq` 验证）
- [ ] 已测试服务启动
- [ ] 已验证 AI Agent 功能正常

## 安全提示

✅ **最佳实践：**
- 私钥文件权限必须是 600（仅所有者可读写）
- 定期备份私钥文件（加密存储）
- 不要将私钥文件提交到 Git
- 不同环境使用不同的密钥

❌ **避免：**
- 在多个地方存储相同的密钥
- 通过不安全渠道传输私钥文件
- 将私钥文件包含在 Docker 镜像中
- 修改已使用的加密密钥

---

**更新完成**: 2025-11-01  
**向后兼容**: ✅ 是（使用相同密钥值）  
**需要迁移**: ⚠️  是（现有用户）  
**破坏性更改**: ❌ 否（使用相同密钥值即可）

