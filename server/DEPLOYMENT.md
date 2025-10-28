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

