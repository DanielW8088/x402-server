# 0x402 Smart Contract

Full-featured ERC20 token with x402 payment integration, EIP-3009 support, and automated liquidity deployment.


```bash
npx hardhat compile
```

## 📚 Documentation

| Document | Description |
|----------|-------------|
| **[USAGE_GUIDE.md](./USAGE_GUIDE.md)** | 📖 **完整使用文档** - 所有合约功能和脚本使用方法 |
| **[LAUNCHTOOL_DEPLOYMENT.md](./LAUNCHTOOL_DEPLOYMENT.md)** | 🔧 **LaunchTool部署指南** - 部署共享LP工具合约 |
| **[LP_QUICK_START.md](./LP_QUICK_START.md)** | 🏊 **LP部署快速指南** - 5分钟完成流动性部署 |
| **[LP_DEPLOYMENT_GUIDE.md](./LP_DEPLOYMENT_GUIDE.md)** | 📋 **LP部署详细文档** - 完整流程和故障排查 |
| **[TOKENOMICS.md](./TOKENOMICS.md)** | 💰 代币经济学 - 20/80分配模型详解 |
| **[contracts/X402Token.sol](./contracts/X402Token.sol)** | 📝 合约源代码 |

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and add PRIVATE_KEY

# 3. Deploy contract
npx hardhat run scripts/deployToken.js --network baseSepolia

# 4. Fund contract with USDC
TOKEN_CONTRACT_ADDRESS=0x... USDC_AMOUNT=40000 \
  npx hardhat run scripts/fundContract.js --network baseSepolia

# 5. Grant minter role to server
TOKEN_CONTRACT_ADDRESS=0x... SERVER_ADDRESS=0x... \
  npx hardhat run scripts/grantRole.js --network baseSepolia

# 6. Deploy LaunchTool (do this ONCE for all tokens)
# Your DEPLOYER_PRIVATE_KEY address will automatically become the admin
npx hardhat run scripts/deployLaunchTool.js --network baseSepolia
  
# 7. After minting completes, deploy LP
TOKEN_ADDRESS=0x... LAUNCH_TOOL_ADDRESS=0x... TARGET_PRICE_USDC=0.5 \
  npx hardhat run scripts/deployFullLiquidityFlow.js --network baseSepolia
```

## 📊 Contract Features

### Core Features
- ✅ **ERC20 Token** with burn functionality
- ✅ **Access Control** - MINTER_ROLE and DEFAULT_ADMIN_ROLE
- ✅ **EIP-3009** - Gasless transfers via meta-transactions
- ✅ **Supply Cap** - Maximum 2 billion tokens
- ✅ **Anti-double-mint** - txHash tracking

### x402 Integration
- 💰 Users pay USDC to mint tokens
- 🎯 Fixed mint amount per payment (configurable)
- 📈 Configurable max mint count (160,000 default)
- 🔄 Automatic duplicate prevention

### Uniswap v4 Auto-deployment
- 🏊 Auto-creates liquidity pool when max mints reached
- 💧 Deploys with 20/80 tokenomics (20% LP, 80% user mints)
- 🎯 Initial price: configurable per deployment
- 🔐 Protocol-owned liquidity (LP NFT to admin)

## 📦 Available Scripts

### Deployment
```bash
# Deploy with default config (20/80 model)
npx hardhat run scripts/deployToken.js --network base

# Deploy to testnet
npx hardhat run scripts/deployToken.js --network baseSepolia
```

### Permission Management
```bash
# Check MINTER_ROLE status
TOKEN_ADDRESS=0x... npx hardhat run scripts/checkMinterRole.js --network base

# Grant MINTER_ROLE to SERVER_PRIVATE_KEY address
TOKEN_ADDRESS=0x... npx hardhat run scripts/grantMinterRole.js --network base
```

### Fund Management
```bash
# Transfer USDC to contract
TOKEN=0x... USDC_AMOUNT=40000 \
  npx hardhat run scripts/fundContract.js --network baseSepolia

# Withdraw USDC from contract
TOKEN=0x... USDC_AMOUNT=1000 \
  npx hardhat run scripts/withdrawUSDC.js --network baseSepolia

# Emergency withdraw (before LP deployment)
TOKEN=0x... \
  npx hardhat run scripts/emergencyWithdraw.js --network baseSepolia
```

### Status Check
```bash
# Check contract status
TOKEN_ADDRESS=0x... npx hardhat run scripts/checkMinterRole.js --network base

# Check token and LP status
TOKEN_ADDRESS=0x... npx hardhat run scripts/checkTokenLpStatus.js --network base
```

### LP Deployment

**Step 1**: 部署 LaunchTool（所有 token 共享，只需做一次）

```bash
# Deploy LaunchTool (do this ONCE)
# Your DEPLOYER_PRIVATE_KEY address will automatically become the admin
npx hardhat run scripts/deployLaunchTool.js --network base
```

See **[LAUNCHTOOL_DEPLOYMENT.md](./LAUNCHTOOL_DEPLOYMENT.md)** for detailed guide.

**Step 2**: 为每个 token 部署 LP

```bash
# Deploy LP for each token (after minting completes)
TOKEN_ADDRESS=0x... \
LAUNCH_TOOL_ADDRESS=0x... \
TARGET_PRICE_USDC=0.5 \
  npx hardhat run scripts/deployFullLiquidityFlow.js --network base
```

See **[LP_QUICK_START.md](./LP_QUICK_START.md)** for detailed LP deployment guide.

## 🏗️ Contract Configuration

### 20/80 Distribution Model (Default)

```
Total Supply:     2,000,000,000 tokens (2B max)
════════════════════════════════════════
LP Pool:                    20% of supply
User Mints:                 80% of supply
════════════════════════════════════════
Mint Amount:           Configurable
Max Mints:            Configurable
LP USDC:              Based on economics
Initial Price:        Configurable
════════════════════════════════════════
```

See [TOKENOMICS.md](./TOKENOMICS.md) for detailed breakdown.

## 🔑 Contract Roles

| Role | Permission | Who |
|------|------------|-----|
| `DEFAULT_ADMIN_ROLE` | Manage roles, withdraw funds, set hooks | Deployer (initially) |
| `MINTER_ROLE` | Call mint() and batchMint() | x402 payment server |

## 🌐 Network Addresses

### Base Sepolia (Testnet)

```javascript
USDC:             0x036CbD53842c5426634e7929541eC2318f3dCF7e
Pool Manager:     0x7da1d65f8b249183667cde74c5cbd46dd38aa829
Position Manager: 0xc01ee65a5087409013202db5e1f77e3b74579abf
Permit2:          0x000000000022d473030f116ddee9f6b43ac78ba3
```

## 📝 Smart Contract Functions

### Minting (MINTER_ROLE)
```solidity
function mint(address to, bytes32 txHash) external
function batchMint(address[] memory to, bytes32[] memory txHashes) public
```

### Fund Management (DEFAULT_ADMIN_ROLE)
```solidity
function withdrawToken(address token, uint256 amount) external
function emergencyWithdraw() external  // Before LP deployment only
function collectLpFees() external      // After LP deployment
```

### Liquidity (DEFAULT_ADMIN_ROLE)
```solidity
function setLpGuardHook(address _lpGuardHook) external  // Before deployment
```

### EIP-3009 (Anyone)
```solidity
function transferWithAuthorization(...) external
function receiveWithAuthorization(...) external
function cancelAuthorization(...) external
```

### View Functions
```solidity
function mintCount() public view returns (uint256)
function maxMintCount() public view returns (uint256)
function mintAmount() public view returns (uint256)
function liquidityDeployed() public view returns (bool)
function maxSupply() public pure returns (uint256)
function remainingSupply() public view returns (uint256)
function hasMinted(bytes32 txHash) public view returns (bool)
function authorizationState(address, bytes32) external view returns (bool)
```

## ⚠️ Important Notes

### Before Deployment
- [ ] Configure deployment via API or update `scripts/deployToken.js`
- [ ] Ensure you have enough ETH for gas
- [ ] Prepare USDC for liquidity (40k for 20/80 model)

### After Deployment
- [ ] Save contract address
- [ ] Grant MINTER_ROLE to payment server
- [ ] Transfer USDC to contract for LP
- [ ] Update server/.env with contract address

### Before LP Deployment
- [ ] Ensure contract has required USDC amount
- [ ] (Optional) Set LP guard hook
- [ ] Cannot use emergencyWithdraw after LP deploys

### After LP Deployment
- [ ] LP is protocol-owned (admin controls)
- [ ] Can collect trading fees via collectLpFees()
- [ ] Can still mint if under max supply
- [ ] Can withdraw tokens via withdrawToken()

## 🔧 Development

```bash
# Compile contracts
npx hardhat compile

# Run tests
npx hardhat test

# Deploy to localhost
npx hardhat node
npx hardhat run scripts/deployToken.js --network localhost

# Console
npx hardhat console --network baseSepolia
```

## 📖 Full Documentation

For complete guide including:
- ✅ All contract functions
- ✅ Step-by-step examples
- ✅ EIP-3009 integration
- ✅ Troubleshooting
- ✅ FAQ

**➡️ See [USAGE_GUIDE.md](./USAGE_GUIDE.md)**

## 📞 Support

- 📚 [Usage Guide](./USAGE_GUIDE.md) - Complete documentation
- 💰 [Tokenomics](./TOKENOMICS.md) - Distribution model
- 📝 [Contract Source](./contracts/X402Token.sol) - Full source code

## 📜 License

MIT

