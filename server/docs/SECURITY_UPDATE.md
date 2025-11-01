# 🔐 Security Update: Private Key Storage

## What Changed?

Private keys are **no longer stored in environment variables**. They are now stored in a secure file with proper permissions.

### Before (❌ Insecure)
```bash
# .env file
SERVER_PRIVATE_KEY=0x...
MINTER_PRIVATE_KEY=0x...
LP_DEPLOYER_PRIVATE_KEY=0x...
```

### After (✅ Secure)
```bash
# /etc/secret/private.key (permissions: 600)
{
  "serverPrivateKey": "0x...",
  "minterPrivateKey": "0x...",
  "lpDeployerPrivateKey": "0x..."
}
```

## Why This Change?

1. ✅ **File permissions**: 600 ensures only owner can read/write
2. ✅ **Not in Git**: Automatically ignored by `.gitignore`
3. ✅ **Not in Docker images**: Mounted at runtime, never baked in
4. ✅ **Easier audit**: Single location with clear permissions
5. ✅ **Industry best practice**: Similar to SSH keys, SSL certs

## Quick Migration (30 seconds)

### Option 1: Automated Migration Script (推荐)

```bash
cd server
bash scripts/migrate-keys-to-file.sh
```

This script will:
- Extract keys from your `.env`
- Create key file with proper permissions
  - **macOS**: `~/.config/token-mint/private.key` (no sudo)
  - **Linux**: `/etc/secret/private.key` (needs sudo)
- Backup and clean your `.env`
- Done! ✓

### Option 2: Manual Setup

**macOS:**
```bash
# 1. Create directory (no sudo needed!)
mkdir -p ~/.config/token-mint

# 2. Create file
nano ~/.config/token-mint/private.key
# Paste this and replace with your actual keys:
# {
#   "serverPrivateKey": "0xYOUR_SERVER_KEY",
#   "minterPrivateKey": "0xYOUR_MINTER_KEY", 
#   "lpDeployerPrivateKey": "0xYOUR_LP_DEPLOYER_KEY"
# }

# 3. Set permissions
chmod 600 ~/.config/token-mint/private.key

# 4. Clean .env (remove old key lines)
# Remove: SERVER_PRIVATE_KEY, MINTER_PRIVATE_KEY, LP_DEPLOYER_PRIVATE_KEY
```

**Linux:**
```bash
# 1. Create directory
sudo mkdir -p /etc/secret
sudo chmod 700 /etc/secret

# 2. Create file
sudo nano /etc/secret/private.key
# Paste JSON with your keys (same format as above)

# 3. Set permissions
sudo chmod 600 /etc/secret/private.key
sudo chown $(whoami) /etc/secret/private.key

# 4. Clean .env
```

## Custom Location (Optional)

Want to use a different path?

```bash
# In .env
PRIVATE_KEY_FILE=/your/custom/path/private.key
```

Then ensure file has 600 permissions and contains the JSON format.

## Docker Deployment

Mount the key file at runtime (never include in image):

```bash
docker run -v /etc/secret/private.key:/etc/secret/private.key:ro \
  -e PRIVATE_KEY_FILE=/etc/secret/private.key \
  your-image
```

Or use Docker Secrets:

```yaml
# docker-compose.yml
services:
  app:
    secrets:
      - private_key
    environment:
      PRIVATE_KEY_FILE: /run/secrets/private_key

secrets:
  private_key:
    file: /etc/secret/private.key
```

## Kubernetes

```bash
# Create secret
kubectl create secret generic private-keys \
  --from-file=private.key=/etc/secret/private.key

# Mount in deployment
spec:
  volumes:
    - name: secrets
      secret:
        secretName: private-keys
  containers:
    - volumeMounts:
        - name: secrets
          mountPath: /etc/secret
          readOnly: true
```

## Testing

After migration, verify it works:

```bash
npm run build
npm start
```

You should see:
```
✓ Private keys loaded from /etc/secret/private.key
```

If you see errors, check:
- File exists: `ls -l /etc/secret/private.key`
- Permissions: Should show `-rw-------` (600)
- Content: Valid JSON with all 3 keys starting with `0x`

## Files Changed

- ✅ `config/env.ts` - Reads from file instead of env vars
- ✅ `services/tokenDeployer.ts` - Uses imported keys
- ✅ `lp-deployer-standalone.ts` - Uses imported keys
- ✅ `.gitignore` - Ignores `*.key` files
- ✅ `env.multi-token.example` - Updated documentation
- ✅ Added: `PRIVATE_KEY_SETUP.md` - Full documentation
- ✅ Added: `config/private.key.example` - Template
- ✅ Added: `scripts/migrate-keys-to-file.sh` - Migration tool

## Rollback (if needed)

If you need to temporarily rollback:

1. Restore your `.env.backup.*` file
2. Temporarily comment out the new key loading in `config/env.ts`
3. Use old environment variable approach

**But don't do this in production!** Fix the secure setup instead.

## Questions?

See detailed docs: `server/PRIVATE_KEY_SETUP.md`

## Security Checklist

- [ ] Keys moved to `/etc/secret/private.key` (or custom path)
- [ ] File permissions set to 600
- [ ] File owned by application user
- [ ] Keys removed from `.env`
- [ ] `.env` backups moved to secure location
- [ ] Docker/K8s deployment updated to mount key file
- [ ] CI/CD pipeline updated (if applicable)
- [ ] Team notified of new setup procedure
- [ ] Documentation updated

## Production Deployment Notes

1. **DO NOT** commit private keys to Git
2. **DO NOT** include keys in Docker images
3. **DO** mount keys at runtime with read-only flag
4. **DO** use different keys for dev/staging/prod
5. **DO** backup keys securely (encrypted storage)
6. **DO** rotate keys periodically
7. **DO** audit file permissions regularly

---

**Last Updated**: November 2025  
**Breaking Change**: Yes (requires migration)  
**Migration Time**: < 1 minute  
**Backward Compatible**: No (must migrate)

