# X402 Token Mint Server

Backend server for automated token deployment and minting with Uniswap V3 liquidity pool integration.

## Quick Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp env.multi-token.example .env
# Edit .env with your settings
```

Key environment variables:
```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Private Keys
SERVER_PRIVATE_KEY=0x...
LP_DEPLOYER_PRIVATE_KEY=0x...
DEPLOYER_PRIVATE_KEY=0x...

# Network
NETWORK=base  # or base-sepolia

# RPC URLs
BASE_RPC_URL=https://mainnet.base.org
BASE_SEPOLIA_RPC_URL=https://sepolia.base.org
```

### 3. Initialize Database

```bash
npm run db:init
```

## Development

Start development server with hot reload:

```bash
npm run dev
```

The server will start on port 3002 (default).

## Production Deployment

### Using PM2

1. Build the project:
```bash
npm run build
```

2. Start all services:
```bash
pm2 start ecosystem.config.cjs
pm2 save
```

3. Enable auto-start on boot:
```bash
pm2 startup
# Follow the command it outputs
```

### PM2 Management

```bash
# Status
pm2 status

# Logs
pm2 logs token-server
pm2 logs token-server --lines 100

# Control
pm2 restart token-server
pm2 stop token-server

# Monitor
pm2 monit
```

## API Endpoints

### Deploy Token

```bash
POST /api/deploy
Content-Type: application/json

{
  "name": "MyToken",
  "symbol": "MTK",
  "mintAmount": "10000",
  "maxMintCount": 10000,
  "price": "1",
  "paymentToken": "USDC",
  "deployer": "0x...",
  "imageUrl": "https://...",
  "description": "My token description"
}
```

### Get Token Info

```bash
GET /api/tokens/:address
```

### List Tokens

```bash
GET /api/tokens?network=base&deployer=0x...
```

## Troubleshooting

### Database Connection Issues

```bash
# Test connection
psql $DATABASE_URL -c "SELECT NOW();"
```

For SSL certificate issues, set in `.env`:
```bash
DB_SSL_CA=/path/to/server-ca.pem
DB_SSL_CERT=/path/to/client-cert.pem
DB_SSL_KEY=/path/to/client-key.pem
```

Or disable SSL (not recommended for production):
```bash
DB_SSL_ENABLED=false
```

### LP Deployment Stuck

```bash
# Check logs
pm2 logs lp-deployer

# Manual reset
psql $DATABASE_URL -c "UPDATE deployed_tokens SET liquidity_deployed = false, lp_retry_count = 0 WHERE address = '0x...';"
```

### View Errors

```bash
pm2 logs token-server --err
# or check logs/server-error.log
```

### Rebuild After Code Changes

```bash
npm run build
pm2 restart token-server
```

## License

MIT
