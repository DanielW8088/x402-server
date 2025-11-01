# Private Key Security Setup

## Overview

Private keys are stored in a secure file system location (not in environment variables or Git) for enhanced security.

## Setup Instructions

### 1. Create Private Key File

**macOS (Recommended - No sudo needed):**
```bash
# Create user config directory
mkdir -p ~/.config/token-mint
touch ~/.config/token-mint/private.key
chmod 600 ~/.config/token-mint/private.key

# Default path on macOS: ~/.config/token-mint/private.key
```

**Linux (Production):**
```bash
# Create system directory with secure permissions
sudo mkdir -p /etc/secret
sudo chmod 700 /etc/secret

# Create the private key file
sudo touch /etc/secret/private.key
sudo chmod 600 /etc/secret/private.key
sudo chown $(whoami) /etc/secret/private.key

# Default path on Linux: /etc/secret/private.key
```

### 2. Add Your Private Keys

Edit the file with your actual private keys:

**macOS:**
```bash
nano ~/.config/token-mint/private.key
```

**Linux:**
```bash
sudo nano /etc/secret/private.key
```

Add the following JSON content:

```json
{
  "serverPrivateKey": "0xYOUR_SERVER_PRIVATE_KEY_HERE",
  "minterPrivateKey": "0xYOUR_MINTER_PRIVATE_KEY_HERE",
  "lpDeployerPrivateKey": "0xYOUR_LP_DEPLOYER_PRIVATE_KEY_HERE",
  "agentEncryptionKey": "1a2b3c4d5e6f7890abcdef1234567890fedcba0987654321abcdef1234567890"
}
```

**Important:**
- Wallet private keys must start with `0x`
- First three keys are required
- `agentEncryptionKey` is optional (required only if using AI Agent feature)
- `agentEncryptionKey` should be 64-character hex string (32 bytes)
- Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- File must be valid JSON

### 3. Verify Permissions

**macOS:**
```bash
# Should show: -rw------- (600)
ls -l ~/.config/token-mint/private.key

# Should be owned by your user
stat -f "%Su:%Sg" ~/.config/token-mint/private.key
```

**Linux:**
```bash
# Should show: -rw------- (600)
ls -l /etc/secret/private.key

# Should be owned by your user
stat -c "%U:%G" /etc/secret/private.key
```

## Custom Location (Optional)

To use a different location, set the `PRIVATE_KEY_FILE` environment variable:

```bash
export PRIVATE_KEY_FILE=/path/to/your/private.key
```

Or in `.env`:

```
PRIVATE_KEY_FILE=/path/to/your/private.key
```

## Docker Deployment

### Option 1: Mount Secret Volume (Recommended)

```bash
docker run -v /etc/secret:/etc/secret:ro \
  -e PRIVATE_KEY_FILE=/etc/secret/private.key \
  your-image
```

### Option 2: Docker Secrets (Swarm/Kubernetes)

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

### Option 3: Use Container-Local Path

```dockerfile
# In Dockerfile - key injected at runtime, not in image
ENV PRIVATE_KEY_FILE=/app/secrets/private.key
```

Then mount at runtime:

```bash
docker run -v /etc/secret/private.key:/app/secrets/private.key:ro your-image
```

## Security Best Practices

✅ **Do:**
- Keep file permissions at 600 (owner read/write only)
- Store in `/etc/secret` or similar protected location
- Mount as read-only in Docker (`ro` flag)
- Use different keys for dev/staging/prod
- Backup keys securely (encrypted storage)

❌ **Don't:**
- Commit private keys to Git (added to .gitignore)
- Include keys in Docker images
- Share keys via insecure channels
- Use same keys across environments
- Store keys in environment variables (legacy approach)

## Migration from Environment Variables

If you're migrating from the old `.env` approach:

1. Copy your keys from `.env`:
   ```bash
   # Old format in .env
   SERVER_PRIVATE_KEY=0x...
   MINTER_PRIVATE_KEY=0x...
   LP_DEPLOYER_PRIVATE_KEY=0x...
   ```

2. Create the new JSON file:
   ```bash
   echo '{
     "serverPrivateKey": "0x...",
     "minterPrivateKey": "0x...",
     "lpDeployerPrivateKey": "0x...",
     "agentEncryptionKey": "..."
   }' | sudo tee /etc/secret/private.key
   sudo chmod 600 /etc/secret/private.key
   ```

3. Remove keys from `.env`:
   ```bash
   # Remove these lines from .env
   sed -i '' '/SERVER_PRIVATE_KEY/d' .env
   sed -i '' '/MINTER_PRIVATE_KEY/d' .env
   sed -i '' '/LP_DEPLOYER_PRIVATE_KEY/d' .env
   ```

## Troubleshooting

### File Not Found
```
❌ Private key file not found: /etc/secret/private.key
```
**Solution:** Create the file following step 1 above.

### Permission Denied
```
❌ Permission denied reading: /etc/secret/private.key
```
**Solution:** Fix permissions:
```bash
sudo chmod 600 /etc/secret/private.key
sudo chown $(whoami) /etc/secret/private.key
```

### Invalid Format
```
❌ Failed to load private keys: Unexpected token
```
**Solution:** Ensure file contains valid JSON with both keys.

### Missing Keys
```
❌ Failed to load private keys: Missing required keys in private key file
```
**Solution:** Ensure all three required keys (`serverPrivateKey`, `minterPrivateKey`, `lpDeployerPrivateKey`) are present. The `agentEncryptionKey` is optional.

## Production Deployment

For production servers:

1. **Manual Setup:**
   ```bash
   ssh production-server
   sudo mkdir -p /etc/secret
   sudo nano /etc/secret/private.key
   # Add keys, save, exit
   sudo chmod 600 /etc/secret/private.key
   sudo chown app-user /etc/secret/private.key
   ```

2. **Ansible/Chef/Puppet:**
   ```yaml
   # Example Ansible
   - name: Create secret directory
     file:
       path: /etc/secret
       state: directory
       mode: '0700'
   
   - name: Copy private keys
     copy:
       content: "{{ private_keys_json }}"
       dest: /etc/secret/private.key
       mode: '0600'
       owner: app-user
   ```

3. **Kubernetes Secrets:**
   ```bash
   kubectl create secret generic private-keys \
     --from-file=private.key=/etc/secret/private.key
   
   # Mount in pod
   volumeMounts:
     - name: secrets
       mountPath: /etc/secret
       readOnly: true
   volumes:
     - name: secrets
       secret:
         secretName: private-keys
   ```

## Example File Format

See `config/private.key.example` for template:

```json
{
  "serverPrivateKey": "0x0000000000000000000000000000000000000000000000000000000000000001",
  "minterPrivateKey": "0x0000000000000000000000000000000000000000000000000000000000000002",
  "lpDeployerPrivateKey": "0x0000000000000000000000000000000000000000000000000000000000000003",
  "agentEncryptionKey": "1a2b3c4d5e6f7890abcdef1234567890fedcba0987654321abcdef1234567890"
}
```

Replace with your actual keys.

**Note on agentEncryptionKey:**
- This key encrypts AI Agent wallet private keys stored in database
- Only needed if you're using the AI Agent feature
- Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Keep it secure - losing this key means losing access to all encrypted agent wallets

