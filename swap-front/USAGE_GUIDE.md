# Liquidity Manager - Usage Guide

## Overview

This tool helps you manage your Uniswap V3 liquidity positions on Base chain. You can:
- Query position details by NFT token ID
- View liquidity and uncollected fees
- Remove liquidity (partially or fully)
- Collect earned fees
- Burn NFT positions (after all liquidity is removed)

## Getting Started

### 1. Installation

```bash
cd swap-front
npm install
```

### 2. Configure Environment

Create a `.env.local` file:

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your WalletConnect Project ID:
```
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

Get a free Project ID at: https://cloud.walletconnect.com

### 3. Run Development Server

```bash
npm run dev
```

Open http://localhost:3003

## How to Use

### Step 1: Connect Wallet

1. Click "Connect Wallet" button in the top right
2. Select your wallet (MetaMask, Coinbase Wallet, etc.)
3. Approve the connection
4. Make sure you're on Base Mainnet or Base Sepolia

### Step 2: Query Your Position

1. Enter your Uniswap V3 NFT token ID
   - Find your token ID on Uniswap app or by checking your wallet
   - Or use a block explorer to see your positions
2. Click "Query" button
3. View your position details:
   - Token pair (e.g., USDC/ETH)
   - Fee tier (0.01%, 0.05%, 0.3%, or 1%)
   - Tick range
   - Current liquidity
   - Uncollected fees

### Step 3: Remove Liquidity (Optional)

**Important**: You must be the owner of the position!

1. Choose removal percentage:
   - Use quick buttons: 25%, 50%, 75%, 100%
   - Or enter custom percentage (1-100)

2. Click "Decrease Liquidity"
   - Approve transaction in your wallet
   - Wait for confirmation

3. Click "Collect Tokens"
   - This withdraws your tokens to your wallet
   - Includes both liquidity + earned fees
   - Approve and wait for confirmation

4. (Optional) Click "Burn NFT"
   - Only available after ALL liquidity is removed
   - Permanently destroys the NFT position
   - This action cannot be undone!

## Understanding Uniswap V3 Positions

### NFT Token ID
Each liquidity position is represented as an NFT. The token ID uniquely identifies your position.

### Tick Range
Uniswap V3 allows concentrated liquidity. Your position is only active within a specific price range (tick range).

### Fee Tier
The trading fee level for the pool:
- 0.01%: Stablecoin pairs
- 0.05%: Less volatile pairs
- 0.3%: Most common pairs
- 1%: Exotic/volatile pairs

### Uncollected Fees
Trading fees earned but not yet withdrawn. You need to call "Collect" to withdraw them.

## Finding Your NFT Token ID

### Method 1: Uniswap Interface
1. Go to https://app.uniswap.org
2. Connect your wallet
3. Click "Pool" → View your positions
4. The token ID is shown for each position

### Method 2: Block Explorer
1. Go to BaseScan (https://basescan.org)
2. Enter your wallet address
3. Click "NFTs" tab
4. Find "Uniswap V3 Positions" collection
5. Your token IDs are listed

### Method 3: Wallet
Some wallets (like MetaMask) show NFTs. Look for "Uniswap V3 Positions" NFT.

## Contract Addresses

### Base Mainnet (Chain ID: 8453)
- NonfungiblePositionManager: `0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1`
- UniswapV3Factory: `0x33128a8fC17869897dcE68Ed026d694621f6FDfD`

### Base Sepolia (Chain ID: 84532)
- NonfungiblePositionManager: `0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2`
- UniswapV3Factory: `0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24`

## Security Notes

⚠️ **Important Security Information**

1. **Verify Position Ownership**: Always verify you're the owner before removing liquidity
2. **Double-Check Token ID**: Make sure you enter the correct NFT token ID
3. **Understand Slippage**: Price changes during transaction execution may affect amounts received
4. **Irreversible Actions**: Burning an NFT cannot be undone
5. **Gas Fees**: Each transaction (decrease, collect, burn) requires gas fees

## Troubleshooting

### "You are not the owner of this position"
- Only the position owner can remove liquidity
- Check you're connected with the correct wallet
- Verify the NFT is in your wallet

### "Transaction Failed"
- Check you have enough ETH for gas
- Verify you're on the correct network (Base)
- Try increasing gas limit in your wallet

### "Position Not Found"
- Verify the token ID is correct
- Make sure the position exists on this network
- Position may have been burned by previous owner

### Token symbols show as "TOKEN0/TOKEN1"
- This is expected for some tokens without metadata
- The actual token addresses are shown below
- You can verify on BaseScan

## FAQ

**Q: Can I remove liquidity from someone else's position?**
A: No, only the NFT owner can manage the position.

**Q: Do I need to remove all liquidity at once?**
A: No, you can remove any percentage (1-100%).

**Q: What happens to fees if I remove liquidity?**
A: Fees accumulate separately. Use "Collect Tokens" to claim both liquidity + fees.

**Q: Can I add more liquidity using this tool?**
A: No, this tool is only for viewing and removing liquidity. Use Uniswap app to add liquidity.

**Q: Is this tool safe?**
A: Yes, it directly interacts with official Uniswap V3 contracts. Always verify contract addresses.

## Support

For issues or questions:
- Check Uniswap V3 docs: https://docs.uniswap.org/
- Base chain docs: https://docs.base.org/

## License

MIT License - see project root for details

