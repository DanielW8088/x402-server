# User System API Quick Reference

## 🎯 Base URL
```
http://localhost:4021
```

## 📋 Endpoints

### 1. Get User Info
```bash
GET /api/user/:address
```
**Response:** User object with wallet, invitation code, points, mint count

**Example:**
```bash
curl http://localhost:4021/api/user/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
```

---

### 2. Use Invitation Code
```bash
POST /api/user/:address/invite
Content-Type: application/json

Body: { "invitationCode": "ABC12345" }
```
**Rules:**
- Can only use once
- Cannot use own code
- Code must exist

**Example:**
```bash
curl -X POST http://localhost:4021/api/user/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb/invite \
  -H "Content-Type: application/json" \
  -d '{"invitationCode": "ABC12345"}'
```

---

### 3. Get User Rank
```bash
GET /api/user/:address/rank
```
**Response:** User's rank number in leaderboard

**Example:**
```bash
curl http://localhost:4021/api/user/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb/rank
```

---

### 4. Get User Referrals
```bash
GET /api/user/:address/referrals
```
**Response:** List of users who used this user's invitation code

**Example:**
```bash
curl http://localhost:4021/api/user/0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb/referrals
```

---

### 5. Get Leaderboard
```bash
GET /api/leaderboard?limit=100&offset=0
```
**Query Params:**
- `limit` (default: 100, max: 1000)
- `offset` (default: 0)

**Response:** Ranked users with stats and pagination

**Example:**
```bash
# Top 10 users
curl http://localhost:4021/api/leaderboard?limit=10

# Users 11-20
curl http://localhost:4021/api/leaderboard?limit=10&offset=10
```

---

### 6. Get Leaderboard Stats
```bash
GET /api/leaderboard/stats
```
**Response:** System-wide statistics (total users, points, mints)

**Example:**
```bash
curl http://localhost:4021/api/leaderboard/stats
```

---

## 🎮 Frontend Examples

### React Hook
```typescript
function useUser(address: string) {
  const [user, setUser] = useState(null);
  const [rank, setRank] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch(`/api/user/${address}`).then(r => r.json()),
      fetch(`/api/user/${address}/rank`).then(r => r.json())
    ]).then(([userData, rankData]) => {
      setUser(userData.user);
      setRank(rankData.rank);
    });
  }, [address]);

  return { user, rank };
}
```

### Use Invitation Code
```typescript
async function applyInvitationCode(address: string, code: string) {
  const response = await fetch(`/api/user/${address}/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invitationCode: code })
  });
  
  const result = await response.json();
  
  if (!result.success) {
    alert(result.error || result.message);
    return false;
  }
  
  return true;
}
```

### Leaderboard Component
```typescript
function Leaderboard() {
  const [data, setData] = useState({ leaderboard: [], stats: {} });

  useEffect(() => {
    fetch('/api/leaderboard?limit=100')
      .then(r => r.json())
      .then(setData);
  }, []);

  return (
    <div>
      <h2>Leaderboard</h2>
      <p>Total Users: {data.stats.total_users}</p>
      <p>Total Points: {data.stats.total_points}</p>
      
      <table>
        <thead>
          <tr>
            <th>Rank</th>
            <th>Address</th>
            <th>Points</th>
            <th>Mints</th>
          </tr>
        </thead>
        <tbody>
          {data.leaderboard.map(entry => (
            <tr key={entry.wallet_address}>
              <td>#{entry.rank}</td>
              <td>{entry.wallet_address}</td>
              <td>{entry.points}</td>
              <td>{entry.mint_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

---

## 🗄️ Database Queries

### View Top Users
```sql
SELECT 
  wallet_address,
  invitation_code,
  points,
  mint_count,
  created_at
FROM users
ORDER BY points DESC
LIMIT 10;
```

### Check Referral Tree
```sql
SELECT 
  u1.wallet_address as inviter,
  u1.points as inviter_points,
  COUNT(u2.id) as referral_count,
  SUM(u2.points) as referral_points
FROM users u1
LEFT JOIN users u2 ON u2.invited_by_wallet = u1.wallet_address
GROUP BY u1.id
HAVING COUNT(u2.id) > 0
ORDER BY referral_count DESC;
```

### Find User by Invitation Code
```sql
SELECT * FROM users WHERE invitation_code = 'ABC12345';
```

---

## 🔧 Redis Commands

### View Cached Leaderboard
```bash
redis-cli GET "leaderboard:global:100:0"
```

### Clear All Cache
```bash
redis-cli FLUSHALL
```

### Check Cache Keys
```bash
redis-cli KEYS "leaderboard:*"
```

---

## 📊 Response Formats

### User Object
```json
{
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
```

### Leaderboard Entry
```json
{
  "rank": 1,
  "wallet_address": "0x...",
  "invitation_code": "ABC12345",
  "points": 150,
  "mint_count": 150
}
```

### Statistics
```json
{
  "total_users": 1000,
  "total_points": 5000,
  "total_mints": 5000
}
```

---

## ⚡ Performance Notes

- **Leaderboard:** Cached 5 minutes in Redis
- **User Lookup:** Direct database query (indexed)
- **Points Update:** Background process (non-blocking)
- **Rank Calculation:** Window function (efficient)

---

## 🚀 Setup Commands

```bash
# Install dependencies
npm install

# Setup database and migrate data
export DATABASE_URL='postgresql://...'
./scripts/setup-users-system.sh

# Start server
npm run dev

# Test APIs
./scripts/test-user-api.sh
```

---

## 📚 Full Documentation

See `USER_POINTS_GUIDE.md` for complete documentation.

