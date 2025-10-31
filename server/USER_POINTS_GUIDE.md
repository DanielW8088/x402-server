# User Points & Invitation System Guide

## Overview

This system provides:
1. **User Management** - Each wallet address is a unique user
2. **Invitation System** - Each user has a unique invitation code
3. **Points System** - 1 point per mint
4. **Leaderboard** - Ranked by points with Redis caching

## Database Setup

### Step 1: Run Migration to Create Users Table

```bash
cd server
psql $DATABASE_URL -f db/migrations/005_add_users_and_points.sql
```

This creates:
- `users` table with wallet_address, invitation_code, points, mint_count
- Automatic invitation code generation
- Indexes for performance
- Foreign key relationships

### Step 2: Migrate Historical Mint Data

```bash
psql $DATABASE_URL -f scripts/migrate-historical-mints.sql
```

This will:
- Create user accounts for all historical minters
- Calculate their mint counts and points from `mint_history`
- Generate unique invitation codes for each user
- Display migration statistics

## API Endpoints

### 1. Get User Information

```http
GET /api/user/:address
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "uuid",
    "wallet_address": "0x...",
    "invitation_code": "ABC12345",
    "invited_by_code": null,
    "invited_by_wallet": null,
    "mint_count": 10,
    "points": 10,
    "created_at": "2025-10-31T...",
    "updated_at": "2025-10-31T..."
  }
}
```

### 2. Use Invitation Code

```http
POST /api/user/:address/invite
Content-Type: application/json

{
  "invitationCode": "ABC12345"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Invitation code applied successfully",
  "user": { ... }
}
```

**Rules:**
- Each user can only use ONE invitation code
- Cannot use your own invitation code
- Invitation code must exist in the system

### 3. Get User Rank

```http
GET /api/user/:address/rank
```

**Response:**
```json
{
  "success": true,
  "rank": 42
}
```

### 4. Get User Referrals

```http
GET /api/user/:address/referrals
```

**Response:**
```json
{
  "success": true,
  "count": 5,
  "referrals": [
    {
      "wallet_address": "0x...",
      "invitation_code": "XYZ78901",
      "mint_count": 3,
      "points": 3,
      "created_at": "2025-10-31T..."
    }
  ]
}
```

### 5. Get Leaderboard

```http
GET /api/leaderboard?limit=100&offset=0
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "total_users": 1000,
    "total_points": 5000,
    "total_mints": 5000
  },
  "leaderboard": [
    {
      "rank": 1,
      "wallet_address": "0x...",
      "invitation_code": "ABC12345",
      "points": 150,
      "mint_count": 150
    }
  ],
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 1000
  }
}
```

**Caching:**
- Cached in Redis for 5 minutes
- Automatically invalidated when users mint or use invitation codes

### 6. Get Leaderboard Stats Only

```http
GET /api/leaderboard/stats
```

**Response:**
```json
{
  "success": true,
  "stats": {
    "total_users": 1000,
    "total_points": 5000,
    "total_mints": 5000
  }
}
```

## Automatic Points Update

When a user successfully mints tokens:
1. Their `mint_count` is automatically incremented
2. Their `points` are automatically incremented (1 point per mint)
3. Leaderboard cache is automatically invalidated

This happens in the background and doesn't slow down the mint process.

## Redis Caching

The system uses Redis to cache:
- **Leaderboard rankings** - 5 minute TTL
- **Leaderboard statistics** - 5 minute TTL

Cache is automatically invalidated when:
- A user mints (points change)
- A user uses an invitation code (relationships change)

If Redis is not available, the system falls back to direct database queries.

## Example Frontend Usage

```typescript
// Get user info
const response = await fetch(`/api/user/${userAddress}`);
const { user } = await response.json();

// Display invitation code
console.log(`Your invitation code: ${user.invitation_code}`);
console.log(`Your points: ${user.points}`);

// Use invitation code
await fetch(`/api/user/${userAddress}/invite`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ invitationCode: 'ABC12345' })
});

// Get leaderboard
const leaderboard = await fetch('/api/leaderboard?limit=10');
const { leaderboard: rankings, stats } = await leaderboard.json();

// Display top 10
rankings.forEach(entry => {
  console.log(`#${entry.rank} - ${entry.wallet_address}: ${entry.points} points`);
});
```

## Database Schema

### Users Table

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY,
    wallet_address VARCHAR(42) UNIQUE NOT NULL,
    invitation_code VARCHAR(10) UNIQUE NOT NULL,
    invited_by_code VARCHAR(10),
    invited_by_wallet VARCHAR(42),
    mint_count INTEGER DEFAULT 0 NOT NULL,
    points INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
```

### Indexes

- `idx_users_wallet` - Fast wallet lookups
- `idx_users_invitation_code` - Fast invitation code validation
- `idx_users_invited_by_wallet` - Fast referral queries
- `idx_users_points` - Fast leaderboard ranking

## Performance Considerations

1. **Batch Mint Updates** - User points are updated in background, doesn't block minting
2. **Redis Caching** - Leaderboard queries are cached for 5 minutes
3. **Efficient Queries** - All queries use proper indexes
4. **Automatic User Creation** - Users are created on first mint automatically

## Troubleshooting

### Migration Errors

If migration fails, check:
1. Database connection is working
2. You have proper permissions
3. Migration hasn't already been run

### Redis Issues

If Redis is unavailable:
- System will continue working
- Queries will hit database directly
- Performance may be slower for leaderboard

### Points Not Updating

If points don't update after minting:
- Check processor logs for errors
- Verify user exists in database
- Check `mint_history` table has the mint record

## Future Enhancements

Possible additions:
1. **Bonus Points** - Extra points for referrals
2. **Rewards** - Exchange points for benefits
3. **Achievements** - Special badges for milestones
4. **Social Features** - User profiles, comments
5. **Analytics** - Referral chain visualization

