# Troubleshooting Guide

## Common Errors and Solutions

### Error: "ABI encoding params/values length mismatch"

**Full Error:**
```
Error: ABI encoding params/values length mismatch. 
Expected length (params): 1 
Given length (values): 0 
Version: viem@2.38.5
```

**Cause:** This error occurs when trying to call a contract function without proper arguments.

**Solution:** ✅ Fixed in the code by:
1. Adding `query.enabled` to control when queries execute
2. Providing default values when tokenId is undefined
3. Only querying when tokenId is valid

**What was changed:**
```typescript
// Before (causes error)
args: tokenId ? [BigInt(tokenId)] : undefined

// After (fixed)
args: tokenId ? [BigInt(tokenId)] : [0n],
query: {
  enabled: !!tokenId && tokenId.length > 0,
}
```

**If you still see this error:**
1. Make sure you've saved all files
2. Restart the dev server: `npm run dev`
3. Hard refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)

---

### Error: "Network mismatch"

**Symptoms:** Wallet shows wrong network, transactions fail

**Solution:**
1. Check your wallet - should be on Base (8453) or Base Sepolia (84532)
2. Click the network selector in your wallet
3. Switch to Base network
4. Refresh the page

---

### Error: "Position not found" or "Invalid token ID"

**Possible Causes:**
1. Token ID doesn't exist on this network
2. Token ID was entered incorrectly
3. Position was burned by previous owner

**Solution:**
1. Double-check the token ID number
2. Verify you're on the correct network (Base Mainnet vs Sepolia)
3. Check the position on BaseScan:
   - Go to https://basescan.org
   - Search for the NonfungiblePositionManager contract
   - Check if the token exists

---

### Error: "You are not the owner"

**Symptoms:** Can view position but can't remove liquidity

**Cause:** The connected wallet doesn't own this position NFT

**Solution:**
1. Verify you're connected with the correct wallet
2. Check who owns the NFT:
   - The owner address is displayed on the position details
   - Compare with your connected wallet address
3. If you should be the owner:
   - The NFT might have been transferred
   - Check your wallet's NFT collection

---

### Error: "User rejected transaction"

**Symptoms:** Transaction popup appears but fails

**Cause:** Transaction was cancelled in wallet

**Solution:**
1. Try the transaction again
2. Make sure you have enough ETH for gas
3. Check the transaction details before approving

---

### Error: "Insufficient funds for gas"

**Symptoms:** Can't submit transaction

**Cause:** Not enough ETH in wallet for gas fees

**Solution:**
1. Add more ETH to your wallet
2. Base gas fees are typically very low (< $0.01)
3. You can bridge ETH from Ethereum mainnet using:
   - https://bridge.base.org
   - Or any major bridge

---

### Error: "WalletConnect connection failed"

**Symptoms:** Can't connect wallet

**Possible Causes:**
1. Missing or invalid WalletConnect Project ID
2. Network issues
3. Wallet app not responding

**Solution:**

**Step 1: Check .env.local**
```bash
# Make sure this file exists and has your Project ID
cat .env.local
```

Should show:
```
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_actual_project_id_here
```

**Step 2: Get Project ID (if missing)**
1. Go to https://cloud.walletconnect.com
2. Sign up/login (free)
3. Create a project
4. Copy the Project ID
5. Add to `.env.local`

**Step 3: Restart dev server**
```bash
# Stop the server (Ctrl+C)
# Then restart:
npm run dev
```

---

### Error: "Contract execution reverted"

**Symptoms:** Transaction fails on blockchain

**Possible Causes:**
1. Trying to remove more liquidity than available
2. Slippage too high (price changed)
3. Position already modified by another transaction

**Solution:**
1. Refresh the position data (click 🔄 Refresh)
2. Try a smaller percentage (e.g., 50% instead of 100%)
3. Wait a few seconds and try again
4. Check recent transactions on BaseScan

---

### Token symbols show as "TOKEN0/TOKEN1"

**Symptoms:** Instead of "USDC/WETH", shows generic names

**Cause:** Token doesn't have standard metadata functions, or fetch failed

**Impact:** This is cosmetic only - doesn't affect functionality

**Solution:**
- The actual token addresses are shown below the position details
- You can verify tokens on BaseScan
- Functionality is not affected (remove liquidity, collect fees still work)

---

### Page is blank or not loading

**Solution:**
1. Check browser console (F12) for errors
2. Make sure dev server is running: `npm run dev`
3. Try a different browser
4. Clear browser cache and reload
5. Check terminal for build errors

---

### "Module not found" errors

**Symptoms:** Dev server fails to start, import errors

**Solution:**
```bash
# Delete node_modules and reinstall
rm -rf node_modules
npm install

# If still failing, try:
npm cache clean --force
npm install
```

---

## Still Having Issues?

### Check These First:

1. **Node.js version**
   ```bash
   node -v  # Should be v18 or higher
   ```

2. **Dependencies installed**
   ```bash
   ls node_modules  # Should have many folders
   ```

3. **Environment variables**
   ```bash
   cat .env.local  # Should have WalletConnect Project ID
   ```

4. **Dev server running**
   ```bash
   # Should see "Local: http://localhost:3003"
   ```

5. **Correct network**
   - Wallet should show "Base" or "Base Sepolia"
   - Not Ethereum mainnet or other chains

### Debug Mode

To see detailed logs in console:

1. Open browser DevTools (F12)
2. Go to Console tab
3. Look for error messages
4. Check Network tab for failed requests

### Common Browser Console Errors

**"Failed to fetch"**
- Network/RPC issue
- Try refreshing the page
- Check your internet connection

**"Hydration error"**
- Next.js specific issue
- Usually resolves with page refresh
- Not affecting functionality

**"Reading properties of undefined"**
- Data not loaded yet
- Should resolve automatically
- If persists, refresh page

---

## Getting Help

If you're still stuck:

1. **Check the code:**
   - All contract calls are in `hooks/usePosition.ts`
   - UI components in `components/`
   - Contract ABIs in `contracts/abis.ts`

2. **Verify on blockchain:**
   - BaseScan: https://basescan.org
   - Check contract addresses in `contracts/addresses.ts`

3. **External resources:**
   - Uniswap V3 Docs: https://docs.uniswap.org/
   - Wagmi Docs: https://wagmi.sh/
   - Base Docs: https://docs.base.org/

---

## Quick Fixes Summary

| Error | Quick Fix |
|-------|-----------|
| ABI encoding mismatch | ✅ Already fixed - restart dev server |
| Can't connect wallet | Add Project ID to `.env.local` |
| Position not found | Check token ID & network |
| Not the owner | Connect correct wallet |
| Out of gas | Add ETH to wallet |
| Transaction failed | Refresh position data, try again |
| Blank page | Check console, restart server |

---

**Last Updated:** October 30, 2025

