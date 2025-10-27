# PAYX Smart Contract

Full-featured ERC20 token with x402 payment integration, EIP-3009 support, and Uniswap v4 auto-deployment.

## 📚 Documentation

| Document | Description |
|----------|-------------|
| **[USAGE_GUIDE.md](./USAGE_GUIDE.md)** | 📖 **完整使用文档** - 所有合约功能和脚本使用方法 |
| **[TOKENOMICS.md](./TOKENOMICS.md)** | 💰 代币经济学 - 20/80分配模型详解 |
| **[contracts/PAYX.sol](./contracts/PAYX.sol)** | 📝 合约源代码 |

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and add PRIVATE_KEY

# 3. Deploy contract
npx hardhat run scripts/deployPAYX.js --network baseSepolia

# 4. Fund contract with USDC
TOKEN_CONTRACT_ADDRESS=0x... USDC_AMOUNT=40000 \
  npx hardhat run scripts/fundContract.js --network baseSepolia

# 5. Grant minter role to server
TOKEN_CONTRACT_ADDRESS=0x... SERVER_ADDRESS=0x... \
  npx hardhat run scripts/grantRole.js --network baseSepolia
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
- 🎯 Fixed mint amount per payment (10,000 PAYX)
- 📈 Configurable max mint count (160,000 default)
- 🔄 Automatic duplicate prevention

### Uniswap v4 Auto-deployment
- 🏊 Auto-creates liquidity pool when max mints reached
- 💧 Deploys 400M PAYX + 40k USDC (20/80 model)
- 🎯 Initial price: 0.0001 USDC per PAYX
- 🔐 Protocol-owned liquidity (LP NFT to admin)

## 📦 Available Scripts

### Deployment
```bash
# Deploy with default config (20/80 model)
npx hardhat run scripts/deployPAYX.js --network baseSepolia

# Deploy and test mint
npx hardhat run scripts/deployAndMintPAYX.js --network baseSepolia
```

### Permission Management
```bash
# Grant MINTER_ROLE
TOKEN_CONTRACT_ADDRESS=0x... SERVER_ADDRESS=0x... \
  npx hardhat run scripts/grantRole.js --network baseSepolia
```

### Fund Management
```bash
# Transfer USDC to contract
TOKEN_CONTRACT_ADDRESS=0x... USDC_AMOUNT=40000 \
  npx hardhat run scripts/fundContract.js --network baseSepolia

# Withdraw USDC from contract
TOKEN_CONTRACT_ADDRESS=0x... USDC_AMOUNT=1000 \
  npx hardhat run scripts/withdrawUSDC.js --network baseSepolia

# Emergency withdraw (before LP deployment)
TOKEN_CONTRACT_ADDRESS=0x... \
  npx hardhat run scripts/emergencyWithdraw.js --network baseSepolia
```

### Status Check
```bash
# Check contract status
TOKEN_CONTRACT_ADDRESS=0x... \
  npx hardhat run scripts/checkPAYX.js --network baseSepolia
```

## 🏗️ Contract Configuration

### 20/80 Distribution Model (Default)

```
Total Supply:     2,000,000,000 PAYX (2B)
════════════════════════════════════════
LP Pool:            400,000,000 (20%)
User Mints:       1,600,000,000 (80%)
════════════════════════════════════════
Mint Amount:           10,000 PAYX
Max Mints:            160,000 times
LP USDC:               40,000 USDC
Initial Price:      $0.0001/PAYX
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
- [ ] Review tokenomics in `scripts/deployPAYX.js`
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
npx hardhat run scripts/deployPAYX.js --network localhost

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
- 📝 [Contract Source](./contracts/PAYX.sol) - Full source code

## 📜 License

MIT

