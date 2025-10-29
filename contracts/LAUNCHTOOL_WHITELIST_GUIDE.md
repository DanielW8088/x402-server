# LaunchTool 白名单功能指南

## 🔍 问题

**X402Token 的转账限制：**
- LP 上线前 (`lpLive == false`)，只有 `owner()` 和 `LP_DEPLOYER` 可以转账
- LaunchTool 合约不在白名单中，无法将 token 转给 PositionManager
- 导致 LP 部署失败

## ✅ 解决方案

添加 `launchTool` 白名单地址，允许 LaunchTool 合约在 LP 上线前转账。

## 📝 修改内容

### 1. X402Token 合约修改

#### A. 添加状态变量
```solidity
/// @notice LaunchTool contract address (allowed to transfer tokens before LP is live)
address public launchTool;
```

#### B. 添加设置函数
```solidity
/// @notice Set LaunchTool address (only owner, only before LP is live)
function setLaunchTool(address _launchTool) external onlyOwner {
    require(!lpLive, "LP already live");
    require(_launchTool != address(0), "Invalid address");
    launchTool = _launchTool;
}
```

#### C. 修改转账限制逻辑
```solidity
function _update(address from, address to, uint256 value) internal override {
    // ...
    if (!lpLive) {
        bool fromIsOwnerOrLP = (from == owner() || from == LP_DEPLOYER);
        bool fromIsLaunchTool = (from == launchTool && launchTool != address(0));  // ✅ 新增
        
        // 允许 owner/LP_DEPLOYER/LaunchTool 转账
        if (!isMint && !isBurn && !fromIsContract && !(fromIsOwnerOrLP || fromIsLaunchTool)) {
            revert TransfersLocked();
        }
    }
    // ...
}
```

## 🚀 使用流程

### 步骤 1: 部署/更新 Token 合约

如果是新部署：
```bash
cd contracts
npx hardhat run scripts/deployTokenSimple.js --network baseSepolia
```

如果是已有 token，需要重新部署（因为添加了新状态变量）。

### 步骤 2: 部署 LaunchTool

```bash
npx hardhat run scripts/deployLaunchTool.js --network baseSepolia
```

记录输出的 LaunchTool 地址：
```
LaunchTool deployed to: 0x1234567890abcdef...
```

### 步骤 3: 设置 LaunchTool 白名单

```bash
TOKEN_ADDRESS=0x你的Token地址 \
LAUNCH_TOOL_ADDRESS=0x你的LaunchTool地址 \
npx hardhat run scripts/setLaunchTool.js --network baseSepolia
```

预期输出：
```
╔════════════════════════════════════════════════════════════╗
║          Set LaunchTool in X402Token Contract             ║
╚════════════════════════════════════════════════════════════╝

📍 Network: baseSepolia
🔑 Signer: 0x你的地址
📝 Token: 0x351ab...
🛠️  LaunchTool: 0x99d67...

📊 Current State:
  Owner: 0x你的地址
  LP Live: false
  Current LaunchTool: 0x0000000000000000000000000000000000000000

🔧 Setting LaunchTool address...
📤 Tx hash: 0xabc123...
⏳ Waiting for confirmation...
✅ Confirmed in block 12345678

🔍 Verification:
  New LaunchTool: 0x99d67...

╔════════════════════════════════════════════════════════════╗
║                    ✅ SUCCESS!                             ║
╚════════════════════════════════════════════════════════════╝

🎉 LaunchTool is now whitelisted for token transfers!
   LaunchTool can now transfer tokens to PositionManager before LP is live.
```

### 步骤 4: 运行流动性部署

现在可以正常运行 LP 部署了：

```bash
TOKEN_ADDRESS=0x你的Token地址 \
LAUNCH_TOOL_ADDRESS=0x你的LaunchTool地址 \
TARGET_PRICE_USDC=0.0001 \
npx hardhat run scripts/deployFullLiquidityFlow.js --network baseSepolia
```

## 🔄 权限流

```
用户钱包 (LP_DEPLOYER)
  ↓ approve MaxUint256
LaunchTool (白名单地址)
  ↓ safeTransferFrom (✅ 允许，因为 from=LP_DEPLOYER)
LaunchTool 持有 tokens
  ↓ forceApprove max
PositionManager
  ↓ safeTransferFrom (✅ 允许，因为 from=launchTool)
LaunchTool → PositionManager (✅ 成功！)
  ↓ mint()
Uniswap V3 Pool (成功创建流动性)
```

## ⚠️ 安全注意事项

### 1. **只能在 LP 上线前设置**
```solidity
require(!lpLive, "LP already live");
```
LP 上线后无法修改 LaunchTool 地址（此时已不需要）。

### 2. **只有 owner 可以设置**
```solidity
function setLaunchTool(address _launchTool) external onlyOwner
```
防止未授权修改。

### 3. **不能设置零地址**
```solidity
require(_launchTool != address(0), "Invalid address");
```

### 4. **转账限制逻辑**
LaunchTool 白名单只在以下情况生效：
- `lpLive == false` (LP 未上线)
- `from == launchTool` (从 LaunchTool 转出)
- LP 上线后，所有用户都可以自由转账

## 🧪 测试验证

### 检查 LaunchTool 是否已设置
```bash
cast call $TOKEN_ADDRESS "launchTool()(address)" --rpc-url $RPC_URL
```

### 检查 LP 状态
```bash
cast call $TOKEN_ADDRESS "lpLive()(bool)" --rpc-url $RPC_URL
```

### 检查 owner
```bash
cast call $TOKEN_ADDRESS "owner()(address)" --rpc-url $RPC_URL
```

## 📊 完整示例

```bash
# 1. 部署 LaunchTool
npx hardhat run scripts/deployLaunchTool.js --network baseSepolia
# 输出: LaunchTool deployed to: 0x99d670f6bA869a504265851FD5130C9c98F0FaB6

# 2. 设置白名单
TOKEN_ADDRESS=0x351ab4061ea605877fc0c4359140bcf13943d206 \
LAUNCH_TOOL_ADDRESS=0x99d670f6bA869a504265851FD5130C9c98F0FaB6 \
npx hardhat run scripts/setLaunchTool.js --network baseSepolia

# 3. 部署流动性
TOKEN_ADDRESS=0x351ab4061ea605877fc0c4359140bcf13943d206 \
LAUNCH_TOOL_ADDRESS=0x99d670f6bA869a504265851FD5130C9c98F0FaB6 \
TARGET_PRICE_USDC=0.0001 \
npx hardhat run scripts/deployFullLiquidityFlow.js --network baseSepolia
```

## 🎯 预期结果

设置白名单后，流动性部署流程：

1. ✅ Step A: Pre-checks
2. ✅ Step A3: Transfer assets (token contract → LP deployer)
3. ✅ Step B: Approve tokens (LP deployer → LaunchTool)
4. ✅ Step C: Create pool
   - ✅ LaunchTool 从 LP deployer 拉币（允许：LP_DEPLOYER 白名单）
   - ✅ LaunchTool 给 PositionManager 批准（允许：launchTool 白名单）
   - ✅ PositionManager.mint() 拉币（允许：from=launchTool）
5. ✅ Step D: Confirm LP live
6. ✅ Step E: Verification

## 🐛 故障排查

### 问题：setLaunchTool 失败 "LP already live"
**原因**: LP 已经上线，无法修改  
**解决**: 只能在 LP 上线前设置

### 问题：setLaunchTool 失败 "Ownable: caller is not the owner"
**原因**: 当前账户不是 token 的 owner  
**解决**: 使用 owner 账户执行

### 问题：LP 部署仍然失败 "TransfersLocked"
**原因**: LaunchTool 地址未正确设置  
**解决**: 
1. 检查 `token.launchTool()` 是否返回正确地址
2. 确认使用的 LaunchTool 地址与设置的一致

## 📚 相关文件

- `X402Token.sol` - Token 合约（包含白名单逻辑）
- `LaunchTool.sol` - LaunchTool 合约
- `setLaunchTool.js` - 设置白名单脚本
- `deployFullLiquidityFlow.js` - 流动性部署脚本

## ✅ 检查清单

在部署流动性前，确保：

- [ ] LaunchTool 已部署
- [ ] Token 合约的 `launchTool` 已设置为 LaunchTool 地址
- [ ] `lpLive == false`
- [ ] LP_DEPLOYER 有足够的 Token 和 USDC
- [ ] LP_DEPLOYER 已授权 LaunchTool MaxUint256

全部完成后，运行流动性部署脚本！🚀

