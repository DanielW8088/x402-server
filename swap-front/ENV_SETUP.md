# Environment Setup

## Required Environment Variables

Create a `.env.local` file in the `swap-front` directory with the following variables:

```bash
# WalletConnect Project ID (REQUIRED)
# Get yours at: https://cloud.walletconnect.com
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id_here

# Network (optional, defaults to base mainnet)
# Options: base, base-sepolia
NEXT_PUBLIC_DEFAULT_NETWORK=base
```

## Getting a WalletConnect Project ID

1. Go to https://cloud.walletconnect.com
2. Sign up or log in
3. Create a new project
4. Copy the Project ID
5. Paste it in your `.env.local` file

This is free and takes less than 2 minutes.

## Example `.env.local`

```bash
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=1234567890abcdef1234567890abcdef
NEXT_PUBLIC_DEFAULT_NETWORK=base
```

**Note**: Never commit `.env.local` to git. It's already in `.gitignore`.

