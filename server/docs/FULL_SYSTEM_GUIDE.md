# 🎉 Complete Points & Invitation System - Full Stack Guide

## 📋 Table of Contents
1. [System Overview](#system-overview)
2. [Backend Setup](#backend-setup)
3. [Frontend Setup](#frontend-setup)
4. [Testing](#testing)
5. [API Reference](#api-reference)

---

## System Overview

### What's Been Built

**Backend (Node.js + PostgreSQL + Redis)**
- User management system
- Invitation code generation
- Points tracking (1 mint = 1 point)
- Leaderboard with caching
- RESTful API endpoints

**Frontend (Next.js + React + Tailwind)**
- Beautiful points & rewards page
- Invitation code sharing
- Global leaderboard
- Referral tracking
- Responsive design

### Features
✅ Each wallet = unique user
✅ Auto-generated invitation codes (8 chars)
✅ One-time invitation code usage
✅ Automatic points on mint
✅ Real-time leaderboard rankings
✅ Redis caching (5min TTL)
✅ Historical data migration

---

## Backend Setup

### 1. Navigate to Server Folder
```bash
cd server
```

### 2. Set Environment Variable
```bash
export DATABASE_URL='postgresql://user:password@host:port/database'
```

### 3. Run Database Migration
```bash
# Option A: One command (creates table + migrates data)
./scripts/setup-users-system.sh

# Option B: Step by step
./scripts/run-migration-only.sh        # Create table
./scripts/migrate-historical-data.sh   # Migrate data
```

### 4. Verify Installation
```bash
# Check table exists
psql $DATABASE_URL -c "\d users"

# Check user count
psql $DATABASE_URL -c "SELECT COUNT(*) FROM users;"

# View top users
psql $DATABASE_URL -c "SELECT wallet_address, invitation_code, points FROM users ORDER BY points DESC LIMIT 10;"
```

### 5. Start Server
```bash
npm run dev
```

Server will start on `http://localhost:4021`

### 6. Test APIs
```bash
# Quick test
./scripts/test-user-api.sh

# Manual test
curl http://localhost:4021/api/leaderboard/stats
```

---

## Frontend Setup

### 1. Navigate to Frontend Folder
```bash
cd 0x402.io
```

### 2. Install Dependencies (if needed)
```bash
npm install
```

### 3. Configure Environment
Create `.env.local`:
```bash
NEXT_PUBLIC_SERVER_URL=http://localhost:4021
```

For production:
```bash
NEXT_PUBLIC_SERVER_URL=https://your-backend-url.com
```

### 4. Start Development Server
```bash
npm run dev
```

Frontend will start on `http://localhost:3000`

### 5. View in Browser
1. Open `http://localhost:3000`
2. Click "My Points" in navigation
3. Connect your wallet
4. See your points and leaderboard!

---

## Testing

### Backend API Tests

```bash
cd server

# Test all user APIs
./scripts/test-user-api.sh http://localhost:4021 0xYourWalletAddress

# Test specific endpoints
curl http://localhost:4021/api/leaderboard/stats
curl http://localhost:4021/api/leaderboard?limit=10
curl http://localhost:4021/api/user/0xYourAddress
```

### Frontend Tests

1. **View Points Page**
   - Navigate to "My Points"
   - Should see stats cards
   - Should see leaderboard

2. **Copy Invitation Code**
   - Click "Copy Code" button
   - Should show "Copied!" feedback

3. **Use Invitation Code**
   - If haven't used one, enter a code
   - Click "Apply Code"
   - Should show success/error message

4. **View Leaderboard**
   - Should show top 50 users
   - Your address should be highlighted
   - Should see ranks, points, mints

5. **Mobile Responsive**
   - Open on mobile device
   - All features should work
   - Layout should adapt

### Integration Test

1. **Mint a Token**
   - Go to "Trending" or "All Tokens"
   - Mint a token
   - Wait for confirmation

2. **Check Points Updated**
   - Go to "My Points"
   - Points should have increased by 1
   - Rank might have changed

3. **Share Invitation**
   - Copy your invitation code
   - Share with someone
   - Have them use it
   - Check your referrals list

---

## API Reference

### Quick Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/user/:address` | Get/create user |
| POST | `/api/user/:address/invite` | Use invitation code |
| GET | `/api/user/:address/rank` | Get user rank |
| GET | `/api/user/:address/referrals` | Get referrals |
| GET | `/api/leaderboard` | Get leaderboard |
| GET | `/api/leaderboard/stats` | Get statistics |

### Detailed Examples

#### Get User Info
```bash
curl http://localhost:4021/api/user/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
```

Response:
```json
{
  "success": true,
  "user": {
    "wallet_address": "0x...",
    "invitation_code": "ABC12345",
    "points": 10,
    "mint_count": 10,
    "rank": 5
  }
}
```

#### Use Invitation Code
```bash
curl -X POST http://localhost:4021/api/user/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb/invite \
  -H "Content-Type: application/json" \
  -d '{"invitationCode": "XYZ67890"}'
```

#### Get Leaderboard
```bash
curl http://localhost:4021/api/leaderboard?limit=10
```

---

## File Structure

### Backend Files
```
server/
├── services/userService.ts              # User logic
├── db/migrations/005_add_users_and_points.sql
├── scripts/
│   ├── migrate-historical-mints.sql
│   ├── setup-users-system.sh
│   ├── run-migration-only.sh
│   ├── migrate-historical-data.sh
│   └── test-user-api.sh
├── USER_POINTS_GUIDE.md
├── API_QUICK_REFERENCE.md
└── USER_SYSTEM_SUMMARY.md
```

### Frontend Files
```
0x402.io/
├── components/PointsView.tsx            # Main points page
├── app/page.tsx                         # Updated with navigation
└── POINTS_SYSTEM_FRONTEND.md
```

---

## Common Issues

### Backend Issues

**Issue**: "role postgres does not exist"
**Fix**: Already fixed! Migration no longer requires postgres role.

**Issue**: "Table already exists"
**Fix**: 
```bash
psql $DATABASE_URL -c "DROP TABLE IF EXISTS users CASCADE;"
./scripts/setup-users-system.sh
```

**Issue**: Points not updating
**Fix**: 
- Check server logs
- Verify userService is initialized
- Check mint completed successfully

### Frontend Issues

**Issue**: Can't fetch data
**Fix**: Check `NEXT_PUBLIC_SERVER_URL` is set correctly

**Issue**: CORS errors
**Fix**: Backend should have CORS enabled (already configured)

**Issue**: Wallet not connecting
**Fix**: Check Wagmi configuration

---

## Production Deployment

### Backend Checklist
- [ ] Set production `DATABASE_URL`
- [ ] Set production `REDIS_URL`
- [ ] Run migrations
- [ ] Enable HTTPS
- [ ] Configure CORS properly
- [ ] Set up monitoring

### Frontend Checklist
- [ ] Set `NEXT_PUBLIC_SERVER_URL` to production backend
- [ ] Build production bundle: `npm run build`
- [ ] Deploy to hosting (Vercel, etc.)
- [ ] Test on production
- [ ] Monitor errors

---

## Monitoring & Maintenance

### Database Queries

```sql
-- Total users and points
SELECT COUNT(*) as users, SUM(points) as total_points FROM users;

-- Top 10 users
SELECT wallet_address, invitation_code, points, mint_count 
FROM users ORDER BY points DESC LIMIT 10;

-- Referral stats
SELECT 
  u1.wallet_address,
  u1.invitation_code,
  COUNT(u2.id) as referral_count
FROM users u1
LEFT JOIN users u2 ON u2.invited_by_wallet = u1.wallet_address
GROUP BY u1.id
ORDER BY referral_count DESC
LIMIT 10;
```

### Redis Cache

```bash
# Check cache
redis-cli GET "leaderboard:global:100:0"

# Clear cache
redis-cli FLUSHALL

# Monitor cache
redis-cli MONITOR
```

### Logs

```bash
# Backend logs (if using PM2)
pm2 logs server

# Check queue processor
tail -f server/logs/server-out-0.log
```

---

## Next Steps

### Immediate
1. ✅ Test the system end-to-end
2. ✅ Share invitation codes
3. ✅ Monitor user growth

### Future Enhancements
1. **Referral Rewards** - Bonus points for referrals
2. **Time-based Leaderboards** - Daily/weekly/monthly
3. **Achievements** - Badges and milestones
4. **Social Features** - User profiles
5. **Rewards Store** - Redeem points
6. **Analytics** - Referral chain visualization

---

## Documentation

- **Backend Full Guide**: `server/USER_POINTS_GUIDE.md`
- **Backend API Reference**: `server/API_QUICK_REFERENCE.md`
- **Backend Summary**: `server/USER_SYSTEM_SUMMARY.md`
- **Frontend Guide**: `0x402.io/POINTS_SYSTEM_FRONTEND.md`
- **Migration Fix**: `server/MIGRATION_FIX.md`

---

## Support

If you encounter issues:
1. Check the logs
2. Review the documentation
3. Test API endpoints individually
4. Verify environment variables
5. Check database connectivity

---

## 🎉 Success!

Your complete points and invitation system is ready!

**Features Summary:**
✅ User management with wallets
✅ Unique invitation codes
✅ Automatic points on mint
✅ Real-time leaderboard
✅ Referral tracking
✅ Beautiful frontend UI
✅ Mobile responsive
✅ Redis caching
✅ Historical data preserved

**Stack:**
- Backend: Node.js + Express + PostgreSQL + Redis
- Frontend: Next.js + React + Tailwind + Wagmi
- APIs: RESTful with proper error handling

Enjoy your new system! 🚀

