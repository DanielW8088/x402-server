# LP Deployment Guide for X402Token

Complete guide to deploy Uniswap V3 liquidity pools for X402Token using the shared LaunchTool contract.

## Overview

This guide covers the complete flow from minting completion to LP deployment and activation:

```
Minting Complete → Transfer Assets → Approve Tokens → Create Pool → Add Liquidity → Confirm Live
```

## Prerequisites

1. **Minting Completed**: All tokens have been minted (`mintCount == maxMintCount`)
2. **LaunchTool Deployed**: Shared LaunchTool contract is deployed
3. **LP Deployer Access**: You have the private key for the `LP_DEPLOYER` account
4. **Funds Ready**: Token contract has collected USDC from sales

## Quick Start

### 1. Configure Environment

```bash
# Copy the example configuration
cp .env.lp-deploy.example .env

# Edit .env with your values
nano .env
```

Required variables:
```bash
TOKEN_ADDRESS=0x...              # Your X402Token contract address
LAUNCH_TOOL_ADDRESS=0x...        # Shared LaunchTool address
TARGET_PRICE_USDC=0.5            # Initial price (1 token = 0.5 USDC)
DEPLOYER_PRIVATE_KEY=0x...       # LP_DEPLOYER private key
```

### 2. Deploy LP

```bash
# For Base mainnet
npx hardhat run scripts/deployFullLiquidityFlow.js --network base

# For Base Sepolia testnet
npx hardhat run scripts/deployFullLiquidityFlow.js --network baseSepolia
```

### 3. Verify

The script will output:
- ✅ Pool address
- ✅ Position (LP NFT) ID
- ✅ Liquidity amount
- ✅ Current price and tick

## Detailed Flow

### Step A: Pre-deployment Checks

The script automatically:

1. **Checks minting status**
   - Verifies `mintingCompleted == true`
   - Or `mintCount >= maxMintCount`

2. **Verifies assets not already transferred**
   - Checks `assetsTransferred()` status

3. **Calls `transferAssetsForLP()`** (if needed)
   - Transfers `POOL_SEED_AMOUNT` tokens to LP_DEPLOYER
   - Transfers required USDC to LP_DEPLOYER
   - Sends excess USDC to EXCESS_RECIPIENT

### Step B: Prepare LP Deployer

4. **Token ordering**
   - Sorts USDC and Token by address (Uniswap V3 requirement)
   - Determines token0 and token1

5. **Price calculation**
   - Converts human-readable price to sqrtPriceX96 format
   - Accounts for decimal differences

6. **Tick range calculation**
   - Gets tick spacing for fee tier
   - Calculates tickLower and tickUpper
   - Default: ±100 * tickSpacing

7. **Token approval**
   - Approves USDC to LaunchTool
   - Approves Token to LaunchTool

### Step C: Create Pool & Add Liquidity

8. **Calls `LaunchTool.configurePoolByAmount()`**
   - Creates new Uniswap V3 pool
   - Initializes with starting price
   - Adds liquidity in one transaction
   - Returns LP NFT (position ID)

### Step D: Confirm LP Live

9. **Calls `X402Token.confirmLpLive()`**
   - Sets `lpLive = true`
   - Unlocks normal ERC20 transfers
   - Disables refund mechanism

### Step E: Verification & Cleanup

10. **Verifies deployment**
    - Checks pool exists on-chain
    - Verifies pool price
    - Confirms position liquidity

11. **Cleans up leftover tokens** (if any)
    - Withdraws unused tokens from LaunchTool
    - Returns to admin (LP_DEPLOYER)

## Configuration Options

### Price Configuration

**TARGET_PRICE_USDC**: Initial pool price

```bash
# Examples:
TARGET_PRICE_USDC=0.5    # 1 token = 0.5 USDC
TARGET_PRICE_USDC=1.0    # 1 token = 1 USDC
TARGET_PRICE_USDC=0.001  # 1 token = 0.001 USDC
```

### Fee Tiers

**FEE_TIER**: Pool trading fee

```bash
FEE_TIER=500      # 0.05% - stable pairs
FEE_TIER=3000     # 0.3%  - most pairs (recommended)
FEE_TIER=10000    # 1%    - exotic pairs
```

### Tick Range

**TICK_RANGE_WIDTH**: Liquidity concentration

```bash
# Wider range = less price impact, more tolerance
TICK_RANGE_WIDTH=200    # Wide range

# Narrower range = more concentrated, earns more fees
TICK_RANGE_WIDTH=50     # Narrow range

# Default
TICK_RANGE_WIDTH=100    # Balanced
```

## Common Issues & Solutions

### Issue 1: "Max mint count not reached yet"

**Problem**: Minting is still ongoing.

**Solution**: Wait for all tokens to be minted, or complete remaining mints first.

### Issue 2: "Assets already transferred"

**Problem**: `transferAssetsForLP()` was already called.

**Solution**: 
- If LP not deployed yet, continue from Step B
- Check LP_DEPLOYER balance to confirm assets received

### Issue 3: "Insufficient token balance"

**Problem**: LP_DEPLOYER doesn't have required tokens.

**Solution**: Call `transferAssetsForLP()` first (script does this automatically).

### Issue 4: "Pool already exists"

**Problem**: Pool was created in a previous run.

**Solution**: 
- Use a different fee tier
- Or add liquidity to existing pool (different script)

### Issue 5: "Tick range out of bounds"

**Problem**: Calculated price results in invalid ticks.

**Solution**: Adjust `TARGET_PRICE_USDC` or `TICK_RANGE_WIDTH`.

## Manual Execution

If you need to run steps manually:

### 1. Transfer Assets

```javascript
// As DEFAULT_ADMIN_ROLE
await x402Token.transferAssetsForLP();
```

### 2. Approve Tokens

```javascript
// As LP_DEPLOYER
await usdc.approve(launchToolAddress, ethers.MaxUint256);
await token.approve(launchToolAddress, ethers.MaxUint256);
```

### 3. Create Pool

```javascript
// As LP_DEPLOYER (must be LaunchTool.admin)
const positionId = await launchTool.configurePoolByAmount(
    token0,
    token1,
    amount0,
    amount1,
    sqrtPriceX96,
    tickLower,
    tickUpper,
    fee
);
```

### 4. Confirm Live

```javascript
// As LP_DEPLOYER
await x402Token.confirmLpLive();
```

## Verification Checklist

After deployment, verify:

- [ ] Pool exists: `IUniswapV3Factory.getPool(token0, token1, fee) != address(0)`
- [ ] Pool initialized: `IUniswapV3Pool.slot0()` returns valid price
- [ ] Position has liquidity: `INonfungiblePositionManager.positions(positionId)`
- [ ] LP live: `X402Token.lpLive() == true`
- [ ] Transfers work: Test a small transfer

## Network Addresses

### Base Mainnet

```
Uniswap V3 Factory: 0x33128a8fC17869897dcE68Ed026d694621f6FDfD
Position Manager:   0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1
USDC:              0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
```

### Base Sepolia

```
Uniswap V3 Factory: 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24
Position Manager:   0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2
USDC (Test):       0x036CbD53842c5426634e7929541eC2318f3dCF7e
```

## Security Notes

1. **Private Keys**: Never commit `.env` to git
2. **Test First**: Always test on Sepolia before mainnet
3. **Verify Addresses**: Double-check all contract addresses
4. **Gas Limits**: Ensure sufficient ETH for gas
5. **Slippage**: Default 1% slippage protection in LaunchTool

## Support

For issues or questions:
1. Check transaction on block explorer
2. Review LaunchTool events
3. Verify token contract state
4. Check error messages in script output

## Advanced: Multiple Tokens

Since LaunchTool is shared across multiple tokens:

1. **Deploy LaunchTool once**
2. **For each token**:
   - Set `TOKEN_ADDRESS` to specific token
   - Run deployment script
   - LaunchTool creates new pool for that token

Example workflow:

```bash
# Token A
TOKEN_ADDRESS=0xAAA... npx hardhat run scripts/deployFullLiquidityFlow.js --network base

# Token B  
TOKEN_ADDRESS=0xBBB... npx hardhat run scripts/deployFullLiquidityFlow.js --network base

# Token C
TOKEN_ADDRESS=0xCCC... npx hardhat run scripts/deployFullLiquidityFlow.js --network base
```

Each token gets its own independent pool, but all use the same LaunchTool contract.

## Troubleshooting Command

Check current state:

```bash
# Check token state
npx hardhat console --network base
> const token = await ethers.getContractAt("X402Token", "0x...")
> await token.mintingCompleted()
> await token.assetsTransferred()
> await token.lpLive()
> await token.lpDeployer()

# Check LaunchTool admin
> const launchTool = await ethers.getContractAt("LaunchTool", "0x...")
> await launchTool.admin()
```

## License

MIT

