# Liquidity Manager - Uniswap V3 on Base

A standalone web tool for managing Uniswap V3 liquidity positions on Base chain.

## Features

✅ **Query Positions** - View position details by NFT token ID  
✅ **Position Info** - Token pair, fee tier, liquidity, tick range  
✅ **Fee Tracking** - See uncollected trading fees  
✅ **Remove Liquidity** - Withdraw liquidity partially or fully  
✅ **Collect Tokens** - Claim your tokens and fees  
✅ **Burn NFT** - Remove empty position NFTs  
✅ **Multi-Network** - Support Base mainnet & testnet  

## Quick Start

### 1. Install Dependencies

```bash
cd swap-front
npm install
```

### 2. Setup Environment

Create `.env.local` file:

```bash
# Get your free Project ID at https://cloud.walletconnect.com
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

See [ENV_SETUP.md](./ENV_SETUP.md) for details.

### 3. Run

```bash
npm run dev
```

Open [http://localhost:3003](http://localhost:3003)

## Usage

1. **Connect Wallet** - Click "Connect Wallet" (top right)
2. **Enter NFT Token ID** - Input your Uniswap V3 position NFT ID
3. **Query Position** - View liquidity, fees, and token info
4. **Manage Liquidity** - Remove liquidity, collect fees, or burn NFT

📖 Full guide: [USAGE_GUIDE.md](./USAGE_GUIDE.md)

## How to Find Your NFT Token ID

**Option 1**: Uniswap App
- Go to https://app.uniswap.org → Pool
- Your position NFT IDs are displayed

**Option 2**: BaseScan
- Visit https://basescan.org
- Enter your wallet address → NFTs tab
- Find "Uniswap V3 Positions" collection

**Option 3**: Your Wallet
- Check NFT section in MetaMask/Coinbase Wallet
- Look for "Uniswap V3: Positions NFT"

## Deployed Contracts (Base)

### Base Mainnet (Chain ID: 8453)
```
NonfungiblePositionManager: 0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1
UniswapV3Factory: 0x33128a8fC17869897dcE68Ed026d694621f6FDfD
```

### Base Sepolia (Chain ID: 84532)
```
NonfungiblePositionManager: 0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2
UniswapV3Factory: 0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24
```

## Tech Stack

- **Framework**: Next.js 14 (React 18)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Web3**: RainbowKit + Wagmi v2 + Viem
- **Contracts**: Uniswap V3 official deployments

## Project Structure

```
swap-front/
├── app/                  # Next.js app directory
│   ├── page.tsx         # Main page
│   ├── layout.tsx       # Root layout
│   ├── providers.tsx    # Wagmi/RainbowKit setup
│   └── globals.css      # Global styles
├── components/          # React components
│   ├── PositionViewer.tsx      # Query & display positions
│   ├── LiquidityRemover.tsx    # Remove liquidity UI
│   └── ConnectButton.tsx       # Wallet connect
├── contracts/           # Smart contract ABIs
│   ├── abis.ts         # Uniswap V3 ABIs
│   └── addresses.ts    # Contract addresses
├── hooks/              # Custom React hooks
│   ├── usePosition.ts  # Fetch position data
│   └── useTokenInfo.ts # Fetch token metadata
└── lib/                # Utilities
    ├── utils.ts        # Helper functions
    └── constants.ts    # Constants (fees, etc)
```

## Build for Production

```bash
npm run build
npm start
```

## Security Notes

⚠️ **Important**:
- Always verify you own the position before removing liquidity
- Double-check token IDs before transactions
- This tool interacts directly with Uniswap V3 contracts
- No backend - all operations are on-chain

## Troubleshooting

**Common issues:**

**"Position not found"**
- Verify token ID is correct
- Check you're on the right network
- Position may have been burned

**"Not the owner"**
- Only the NFT owner can remove liquidity
- Connect with the wallet that owns the position

**"ABI encoding params/values length mismatch"**
- ✅ Fixed - restart dev server: `npm run dev`
- Hard refresh browser (Ctrl+Shift+R)

**Token symbols show as "TOKEN0/TOKEN1"**
- This is expected for tokens without metadata
- Addresses are shown below for verification

📖 **Full troubleshooting guide:** [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)

## License

MIT

