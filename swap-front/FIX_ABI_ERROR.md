# ✅ Fix: ABI Encoding Error

## The Error You're Seeing

```
Error: ABI encoding params/values length mismatch. 
Expected length (params): 1 
Given length (values): 0 
Version: viem@2.38.5
```

## ✅ This Has Been Fixed!

The code has been updated to properly handle contract queries. Here's what to do:

## Quick Fix (30 seconds)

### Step 1: Stop the dev server
Press `Ctrl+C` in your terminal

### Step 2: Restart it
```bash
npm run dev
```

### Step 3: Hard refresh your browser
- **Windows/Linux**: `Ctrl + Shift + R`
- **Mac**: `Cmd + Shift + R`

That's it! The error should be gone.

---

## What Was Wrong?

The `usePosition` hook was trying to query the blockchain even when no token ID was entered. 

**Before (caused error):**
```typescript
args: tokenId ? [BigInt(tokenId)] : undefined
```

**After (fixed):**
```typescript
args: tokenId ? [BigInt(tokenId)] : [0n],
query: {
  enabled: !!tokenId && tokenId.length > 0,  // Only query when tokenId exists
}
```

Now the contract query only happens **after** you enter a token ID and click "Query".

---

## Still Seeing the Error?

Try the auto-fix script:

```bash
./fix-common-issues.sh
```

Or manually:

```bash
# 1. Clear cache
rm -rf .next

# 2. Reinstall dependencies
rm -rf node_modules
npm install

# 3. Restart dev server
npm run dev
```

---

## Verify It's Working

1. Start the app: `npm run dev`
2. Open: http://localhost:3003
3. Connect your wallet
4. Enter a token ID
5. Click "Query"
6. Should see position details (no error!)

---

## Need More Help?

See [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for more solutions.

