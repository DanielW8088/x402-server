# User Points & Invitation System - Implementation Summary

## ✅ Completed Features

### 1. Database Schema
- ✅ Created `users` table with all required fields
- ✅ Added wallet_address (unique identifier)
- ✅ Added invitation_code (auto-generated, unique)
- ✅ Added invited_by_code and invited_by_wallet (for referral tracking)
- ✅ Added mint_count and points (1 point per mint)
- ✅ Added proper indexes for performance
- ✅ Added foreign key constraints

### 2. Historical Data Migration
- ✅ SQL script to migrate all historical mint data
- ✅ Automatically calculates mint counts from `mint_history`
- ✅ Generates unique invitation codes for existing users
- ✅ Displays migration statistics

### 3. User Service
- ✅ `getOrCreateUser()` - Auto-create user on first access
- ✅ `getUserByWallet()` - Get user info
- ✅ `useInvitationCode()` - Apply invitation code (one-time only)
- ✅ `incrementMintCount()` - Update points after mint
- ✅ `getLeaderboard()` - Get ranked users with Redis cache
- ✅ `getUserRank()` - Get specific user's rank
- ✅ `getUserReferrals()` - Get list of invited users
- ✅ `getLeaderboardStats()` - Get system-wide statistics

### 4. API Endpoints
- ✅ `GET /api/user/:address` - Get/create user
- ✅ `POST /api/user/:address/invite` - Use invitation code
- ✅ `GET /api/user/:address/rank` - Get user rank
- ✅ `GET /api/user/:address/referrals` - Get referrals
- ✅ `GET /api/leaderboard` - Get leaderboard with pagination
- ✅ `GET /api/leaderboard/stats` - Get statistics only

### 5. Automatic Points Update
- ✅ Integrated with `MintQueueProcessor`
- ✅ Auto-updates points after successful mint
- ✅ Runs in background (non-blocking)
- ✅ Handles batch mints efficiently
- ✅ Auto-invalidates leaderboard cache

### 6. Redis Caching
- ✅ Leaderboard cached for 5 minutes
- ✅ Statistics cached for 5 minutes
- ✅ Auto-invalidation on data changes
- ✅ Graceful fallback if Redis unavailable

### 7. Business Rules
- ✅ Each wallet = one user
- ✅ Each user has unique invitation code
- ✅ Can only use invitation code once
- ✅ Cannot use own invitation code
- ✅ 1 mint = 1 point (automatic)
- ✅ Leaderboard sorted by points DESC

## 📁 Files Created/Modified

### New Files
```
server/
├── services/userService.ts                    # User management logic
├── db/migrations/005_add_users_and_points.sql # Database schema
├── scripts/
│   ├── migrate-historical-mints.sql          # Data migration
│   ├── setup-users-system.sh                 # Setup automation
│   └── test-user-api.sh                      # API testing
├── USER_POINTS_GUIDE.md                      # Complete documentation
└── USER_SYSTEM_SUMMARY.md                    # This file
```

### Modified Files
```
server/
├── index-multi-token.ts         # Added user APIs and integration
└── queue/processor.ts           # Added automatic points update
```

## 🚀 Quick Start

### 1. Setup Database
```bash
cd server
export DATABASE_URL='your-database-url'
./scripts/setup-users-system.sh
```

### 2. Start Server
```bash
npm run dev
```

### 3. Test APIs
```bash
./scripts/test-user-api.sh http://localhost:4021 0xYourWalletAddress
```

## 🎯 Key Features

### Invitation System
- Each user gets unique 8-char alphanumeric code (e.g., "ABC12345")
- Auto-generated on user creation
- Can be used by other users to establish referral relationship
- One-time use per user

### Points System
- Automatic: 1 mint = 1 point
- No manual intervention needed
- Updates in background after successful mint
- Historical data preserved

### Leaderboard
- Real-time rankings
- Redis cached (5min TTL)
- Pagination support
- Global statistics

### Performance
- All queries use proper indexes
- Redis caching for leaderboard
- Background points update (non-blocking)
- Efficient batch processing

## 📊 API Examples

```bash
# Get user info
curl http://localhost:4021/api/user/0x123...

# Use invitation code
curl -X POST http://localhost:4021/api/user/0x123.../invite \
  -H "Content-Type: application/json" \
  -d '{"invitationCode": "ABC12345"}'

# Get leaderboard (top 100)
curl http://localhost:4021/api/leaderboard?limit=100

# Get user rank
curl http://localhost:4021/api/user/0x123.../rank

# Get referrals
curl http://localhost:4021/api/user/0x123.../referrals
```

## 🔧 Database Queries

```sql
-- View all users
SELECT * FROM users ORDER BY points DESC LIMIT 10;

-- Check invitation relationships
SELECT 
  u1.wallet_address as inviter,
  u1.invitation_code,
  COUNT(u2.id) as referral_count
FROM users u1
LEFT JOIN users u2 ON u2.invited_by_wallet = u1.wallet_address
GROUP BY u1.id
ORDER BY referral_count DESC;

-- Get top users with referral info
SELECT 
  wallet_address,
  invitation_code,
  points,
  mint_count,
  invited_by_code,
  (SELECT COUNT(*) FROM users u2 WHERE u2.invited_by_wallet = u.wallet_address) as referral_count
FROM users u
ORDER BY points DESC
LIMIT 20;
```

## 🎨 Frontend Integration Example

```typescript
import { useState, useEffect } from 'react';

function UserProfile({ address }) {
  const [user, setUser] = useState(null);
  const [rank, setRank] = useState(null);

  useEffect(() => {
    // Get user info
    fetch(`/api/user/${address}`)
      .then(res => res.json())
      .then(data => setUser(data.user));

    // Get rank
    fetch(`/api/user/${address}/rank`)
      .then(res => res.json())
      .then(data => setRank(data.rank));
  }, [address]);

  return (
    <div>
      <h2>Your Profile</h2>
      <p>Points: {user?.points}</p>
      <p>Rank: #{rank}</p>
      <p>Your Invite Code: {user?.invitation_code}</p>
      <p>Mints: {user?.mint_count}</p>
    </div>
  );
}

function Leaderboard() {
  const [leaderboard, setLeaderboard] = useState([]);

  useEffect(() => {
    fetch('/api/leaderboard?limit=10')
      .then(res => res.json())
      .then(data => setLeaderboard(data.leaderboard));
  }, []);

  return (
    <div>
      <h2>Top Users</h2>
      {leaderboard.map(entry => (
        <div key={entry.wallet_address}>
          #{entry.rank} - {entry.wallet_address}: {entry.points} points
        </div>
      ))}
    </div>
  );
}
```

## ✨ Next Steps (Optional Enhancements)

1. **Referral Rewards** - Bonus points for successful referrals
2. **Achievement System** - Badges for milestones
3. **Time-based Leaderboards** - Daily/weekly/monthly rankings
4. **Social Features** - User profiles, avatars
5. **Analytics Dashboard** - Referral chain visualization
6. **Rewards Marketplace** - Exchange points for benefits

## 📖 Documentation

For complete API documentation, see:
- `USER_POINTS_GUIDE.md` - Full guide with all endpoints and examples

## 🐛 Troubleshooting

### Migration fails
- Check DATABASE_URL is set correctly
- Ensure you have proper permissions
- Check if migration already ran

### Points not updating
- Check server logs for errors
- Verify userService is initialized
- Check processor logs during mint

### Leaderboard slow
- Ensure Redis is running
- Check Redis connection in logs
- Monitor cache hit rates

### Invitation code issues
- Codes are case-insensitive
- Must be exactly 8 characters
- Auto-generated on user creation

## 🎉 Success Criteria

All requirements completed:
- ✅ User table storing wallet addresses
- ✅ Historical mint data migrated
- ✅ Invitation code system (one-time use)
- ✅ Points system (1 mint = 1 point)
- ✅ Leaderboard with Redis cache
- ✅ Fully functional API endpoints
- ✅ Automatic integration with mint process
- ✅ Complete documentation

