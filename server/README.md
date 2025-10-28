# X402 Token Mint Server

Backend server for automated token deployment and minting with Uniswap V3 liquidity pool integration.

## Features

- 🚀 Automated token deployment with configurable parameters
- 💰 USDC/USDT payment integration
- 🔄 Batch minting queue system
- 💧 Automatic Uniswap V3 LP deployment
- ✅ **Contract verification on Basescan**
- 📊 PostgreSQL database for tracking deployments
- 🔐 Role-based access control

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp env.multi-token.example .env
# Edit .env with your settings
```

### 3. Initialize Database

```bash
npm run db:init
npm run db:migrate-verification
```

### 4. Start Server

```bash
# Development
npm run dev:multi-token

# Production
npm run start:multi-token
```

## Contract Verification

自动部署的合约可以批量验证开源到 Basescan。

### 快速验证

```bash
# 1. 配置 Basescan API Key
echo "BASESCAN_API_KEY=你的密钥" >> ../contracts/.env

# 2. 查看待验证合约
npm run check-verification

# 3. 批量验证
npm run verify
```

**详细文档：**
- 📖 [合约验证快速开始](./VERIFICATION_QUICKSTART.md)
- 📚 [完整验证指南](./CONTRACT_VERIFICATION.md)

## Available Scripts

### Development

| Script | Description |
|--------|-------------|
| `npm run dev:multi-token` | Start development server with hot reload |
| `npm run lp-deployer:watch` | Start LP deployer with hot reload |

### Production

| Script | Description |
|--------|-------------|
| `npm run start:multi-token` | Start production server |
| `npm run lp-deployer` | Start LP deployer |

### Database

| Script | Description |
|--------|-------------|
| `npm run db:init` | Initialize database schema |
| `npm run db:migrate-verification` | Add verification fields |
| `npm run queue:config` | Check queue configuration |

### Contract Verification

| Script | Description |
|--------|-------------|
| `npm run check-verification` | View verification status |
| `npm run verify` | Verify all unverified contracts |
| `npm run verify:base` | Verify Base Mainnet contracts only |
| `npm run verify:sepolia` | Verify Base Sepolia contracts only |

### Utilities

| Script | Description |
|--------|-------------|
| `npm run address` | Get server address from private key |
| `npm run build` | Compile TypeScript |

## API Endpoints

### Token Deployment

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

### Token Info

```bash
GET /api/tokens/:address
```

### List Tokens

```bash
GET /api/tokens?network=base&deployer=0x...
```

## Architecture

```
server/
├── index-multi-token.ts          # Main API server
├── lp-deployer-standalone.ts     # LP deployment service
├── services/
│   └── tokenDeployer.ts          # Token deployment & verification
├── queue/
│   └── processor.ts              # Batch mint processor
├── scripts/
│   ├── verify-contracts.ts       # Batch verification
│   └── check-verification-status.ts
├── db/
│   ├── init.ts                   # Database initialization
│   ├── schema-v3.sql             # Database schema
│   └── add-verification-fields.sql
└── logs/                          # PM2 logs
```

## Database Schema

### deployed_tokens

Stores all deployed token information including:
- Token metadata (name, symbol, addresses)
- Deployment parameters (mint amount, price, etc.)
- LP configuration
- **Verification data** (constructor args, compiler config, status)
- LP deployment status

### mint_queue / mint_history

Tracks mint requests and completed mints.

## Deployment

### Using PM2

```bash
npm install -g pm2

# Start all services
pm2 start ecosystem.config.cjs

# View logs
pm2 logs

# Monitor
pm2 monit
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

## Environment Variables

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

# Contract Verification (in contracts/.env)
BASESCAN_API_KEY=...
```

See [env.multi-token.example](./env.multi-token.example) for all options.

## Monitoring

### Queue Status

```bash
npm run queue:config
```

### Verification Status

```bash
npm run check-verification
```

### Database Queries

```sql
-- Token stats
SELECT network, COUNT(*), 
       COUNT(*) FILTER (WHERE verification_status = 'verified') as verified
FROM deployed_tokens 
GROUP BY network;

-- Recent deployments
SELECT address, name, symbol, network, created_at
FROM deployed_tokens
ORDER BY created_at DESC
LIMIT 10;
```

## Security

- All private keys in environment variables
- Database SSL enabled by default
- Rate limiting on API endpoints
- Input validation on all parameters
- Role-based access control on contracts

## Troubleshooting

### Verification Issues

See [CONTRACT_VERIFICATION.md](./CONTRACT_VERIFICATION.md#故障排除)

### LP Deployment Stuck

```bash
# Check logs
pm2 logs lp-deployer

# Manual intervention via database
UPDATE deployed_tokens 
SET liquidity_deployed = false, lp_retry_count = 0
WHERE address = '0x...';
```

### Database Connection Issues

```bash
# Test connection
psql $DATABASE_URL -c "SELECT NOW();"

# Check SSL settings
echo $DB_SSL_ENABLED
```

## Contributing

1. Follow TypeScript best practices
2. Add tests for new features
3. Update documentation
4. Run linter before commit

## Documentation

- [Deployment Guide](./DEPLOYMENT.md)
- [Gas Optimization](./GAS_OPTIMIZATION.md)
- [Contract Verification Quickstart](./VERIFICATION_QUICKSTART.md)
- [Contract Verification Full Guide](./CONTRACT_VERIFICATION.md)
- [Verification Troubleshooting](./TROUBLESHOOTING.md)
- [Verification Updates](./VERIFICATION_UPDATES.md)
- [Environment Variables](./env.multi-token.example)

## Support

For issues or questions:
1. Check documentation
2. Review logs: `pm2 logs`
3. Check database: `npm run check-verification`
4. Verify environment variables

## License

MIT

