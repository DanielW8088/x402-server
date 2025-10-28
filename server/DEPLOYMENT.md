# Server Deployment Guide

## Prerequisites

```bash
npm install -g pm2
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
pm2 start ecosystem.config.js --only token-server
pm2 save
```

### Start all services:
```bash
pm2 start ecosystem.config.js
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

### ERR_MODULE_NOT_FOUND errors:
If you see `Cannot find module` errors with ES modules, ensure all local imports in TypeScript files use `.js` extensions:
```typescript
// Correct
import { foo } from "./services/bar.js";

// Wrong
import { foo } from "./services/bar";
```

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

