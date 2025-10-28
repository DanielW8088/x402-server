# Server Deployment Guide

## Prerequisites

### Node.js Version
Hardhat requires Node.js LTS version (18.x or 20.x). Check your version:
```bash
node --version
```

If you're using Node.js 21+ (unsupported), switch to LTS:
```bash
# Using nvm (recommended)
nvm install 20
nvm use 20

# Or using n
n lts
```

### PM2
```bash
npm install -g pm2
```

**Important:** The server expects the `contracts` directory to be at the same level as the `server` directory:
```
project-root/
├── server/
└── contracts/
```

## Build

```bash
npm run build
```

This compiles TypeScript files from the source to `dist/` directory.

## Configuration

1. Copy environment file:
```bash
cp env.multi-token.example .env
```

2. Edit `.env` with your configuration:
   - Database URL
   - Private keys
   - RPC endpoints
   - Contract addresses
   - SSL certificates (if required)

## Run with PM2 (Production)

### Start token server only:
```bash
pm2 start ecosystem.config.cjs --only token-server
pm2 save
```

### Start all services:
```bash
pm2 start ecosystem.config.cjs
pm2 save
```

### Enable auto-start on boot:
```bash
pm2 startup
# Follow the command it outputs
```

## PM2 Management

### Status:
```bash
pm2 status
pm2 list
```

### Logs:
```bash
pm2 logs token-server
pm2 logs token-server --lines 100
```

### Control:
```bash
pm2 restart token-server
pm2 stop token-server
pm2 delete token-server
```

### Monitor:
```bash
pm2 monit
```

## Development Mode

```bash
npm run dev
# or
npx tsx index-multi-token.ts
```

## Troubleshooting

### module is not defined in ES module scope:
If you see this error when starting PM2, it's because the project uses `"type": "module"` in package.json. Use the `.cjs` extension for PM2 config:
```bash
pm2 start ecosystem.config.cjs
```

### SSL certificate verification errors:

**Option 1: Certificate authentication (recommended for production)**

For databases requiring certificate authentication (e.g., Google Cloud SQL):

1. Download SSL certificates from your database provider
2. Place them in a secure location (e.g., `server/certs/`)
3. Add to `.env`:
```bash
DB_SSL_CA=/path/to/server-ca.pem
DB_SSL_CERT=/path/to/client-cert.pem
DB_SSL_KEY=/path/to/client-key.pem
DATABASE_URL=postgresql://user:pass@host:5432/dbname
```

**Option 2: Relaxed SSL (for development)**

If certificates aren't available, the server automatically uses `rejectUnauthorized: false` for remote databases (not localhost). Just ensure `DATABASE_URL` points to your remote database.

**Option 3: Disable SSL completely**

To completely disable SSL (not recommended for production):
```bash
DB_SSL_ENABLED=false
DATABASE_URL=postgresql://user:pass@host:5432/dbname
```

### __dirname is not defined:
This error occurs because the project uses ES modules (`"type": "module"` in package.json). The fix is already applied in the codebase using:
```typescript
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

### ERR_MODULE_NOT_FOUND errors:
If you see `Cannot find module` errors with ES modules, ensure all local imports in TypeScript files use `.js` extensions:
```typescript
// Correct
import { foo } from "./services/bar.js";

// Wrong
import { foo } from "./services/bar";
```

### ENOENT: no such file or directory (contracts/scripts/deployToken-generated.js):
This error means the `contracts` directory is not in the expected location. The server logs will show:
- `📝 Writing deployment script to: [path]` - where it tries to write the script
- `📂 Contracts directory: [path]` - where it tries to run hardhat

**Solution 1 (Recommended):** Set `CONTRACTS_DIR` environment variable to the absolute path:
```bash
# In .env file or environment
CONTRACTS_DIR=/home/user/x402-server/contracts
```

**Solution 2:** Ensure standard directory structure:
```
project-root/
├── server/          (this directory)
├── contracts/       (must be at same level as server/)
│   └── scripts/
└── client/
```

The server automatically generates `deployToken-generated.js` at runtime (this file is gitignored).

### Rebuild after code changes:
```bash
npm run build
pm2 restart token-server
```

### View errors:
```bash
pm2 logs token-server --err
# or check logs/server-error.log
```

### Clear logs:
```bash
pm2 flush
```

