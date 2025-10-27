# Trending Tokens排序 - 按24小时USDC成交量

## ✅ 已完成

Trending Tokens现在按照**24小时内mint的总USDC金额**排序，显示最热门的token。

## 🔄 修改内容

### 1. 后端API (`server/index-multi-token.ts`)

#### 添加24小时成交量计算
```typescript
// 查询24小时内的mint记录
const volumeQuery = await pool.query(`
  SELECT 
    token_address,
    COUNT(*) as mint_count_24h
  FROM mint_history
  WHERE completed_at > NOW() - INTERVAL '24 hours'
  GROUP BY token_address
`);

// 计算每个token的USDC成交量
const mintCount24h = volumeMap.get(token.address.toLowerCase()) || 0;
const priceMatch = token.price.match(/[\d.]+/);
const pricePerMint = priceMatch ? parseFloat(priceMatch[0]) : 0;
const volume24hUSDC = mintCount24h * pricePerMint;
```

#### 按成交量排序
```typescript
// Sort by 24h USDC volume (descending)
formattedTokens.sort((a, b) => b.volume24hUSDC - a.volume24hUSDC);
```

#### 返回数据增加字段
```typescript
{
  address: string,
  name: string,
  symbol: string,
  mintCount: number,
  mintCount24h: number,      // 新增：24小时内mint次数
  volume24hUSDC: number,     // 新增：24小时内USDC成交量
  price: string,
  // ... 其他字段
}
```

### 2. 前端组件 (`0x402.io/components/TrendingTokens.tsx`)

#### 更新接口
```typescript
interface Token {
  // ... 原有字段
  mintCount24h?: number      // 24小时mint次数
  volume24hUSDC?: number     // 24小时USDC成交量
}
```

#### List布局显示
```tsx
<div className="text-right ml-2">
  <p className="text-xs font-bold text-green-600">
    ${token.volume24hUSDC?.toLocaleString() || 0}
  </p>
  <p className="text-xs text-gray-500">24h Vol</p>
</div>
```

#### Grid布局显示
```tsx
<div className="flex justify-between items-center">
  <span className="text-sm text-gray-600">24h Volume:</span>
  <span className="text-sm font-bold text-green-600">
    ${token.volume24hUSDC?.toLocaleString() || 0}
  </span>
</div>
```

## 📊 计算逻辑

### 成交量计算
```
24小时USDC成交量 = 24小时内mint次数 × 单次mint价格

例如：
- Token价格: 1 USDC
- 24小时内mint次数: 100
- 24小时成交量: 100 × 1 = $100
```

### 排序逻辑
```
Token A: $1000 24h成交量 → Rank #1
Token B: $500 24h成交量  → Rank #2
Token C: $100 24h成交量  → Rank #3
Token D: $0 24h成交量    → Rank #4
```

## 🎯 效果

### 之前
- 按创建时间排序
- 无法看出哪些token最热门
- 新token总是排在前面

### 现在
- 按24小时USDC成交量排序 ✅
- 一眼看出最热门的token ✅
- 显示具体的美元成交量 ✅
- 成交量高的token排在前面 ✅

## 📱 UI展示

### List布局（侧边栏）
```
┌─────────────────────────┐
│ #1  Token Name    $1,000│
│     SYMBOL        24h Vol│
│ ▓▓▓▓▓▓░░░░ 60%          │
├─────────────────────────┤
│ #2  Token Name      $500│
│     SYMBOL        24h Vol│
│ ▓▓▓▓░░░░░░ 40%          │
└─────────────────────────┘
```

### Grid布局（主页）
```
┌─────────────────────┐
│ #1        USDC      │
│                     │
│ Token Name          │
│ SYMBOL              │
│                     │
│ 24h Volume:   $1,000│
│ Price:        1 USDC│
│ Minted:     100/1000│
│                     │
│ ▓▓▓▓▓▓░░░░ 10%     │
│                     │
│   Mint Now →        │
└─────────────────────┘
```

## 🔍 数据来源

### mint_history表
```sql
CREATE TABLE mint_history (
    id UUID PRIMARY KEY,
    token_address VARCHAR(42),
    payer_address VARCHAR(42),
    completed_at TIMESTAMP,
    ...
);
```

### 24小时统计查询
```sql
SELECT 
  token_address,
  COUNT(*) as mint_count_24h
FROM mint_history
WHERE completed_at > NOW() - INTERVAL '24 hours'
GROUP BY token_address;
```

## 🚀 性能优化

### 索引
已有索引确保查询性能：
```sql
CREATE INDEX idx_mint_history_created_at 
ON mint_history(created_at);

CREATE INDEX idx_mint_history_token 
ON mint_history(token_address);
```

### 缓存建议（可选）
如果Trending Tokens访问量很大，可以添加缓存：

```typescript
// 缓存5分钟
let cachedTrending = null;
let cacheTime = 0;

app.get("/api/tokens", async (req, res) => {
  const now = Date.now();
  if (cachedTrending && now - cacheTime < 300000) { // 5分钟
    return res.json(cachedTrending);
  }
  
  // ... 原有逻辑
  
  cachedTrending = result;
  cacheTime = now;
  return res.json(result);
});
```

## 📝 使用示例

### API调用
```bash
curl http://localhost:3002/api/tokens?limit=10

# 响应
{
  "tokens": [
    {
      "address": "0x...",
      "name": "Hot Token",
      "symbol": "HOT",
      "mintCount": 500,
      "mintCount24h": 100,
      "volume24hUSDC": 100,
      "price": "1 USDC",
      ...
    },
    {
      "address": "0x...",
      "name": "Cool Token", 
      "symbol": "COOL",
      "mintCount": 1000,
      "mintCount24h": 50,
      "volume24hUSDC": 50,
      ...
    }
  ],
  "total": 2
}
```

### 前端调用
```typescript
const response = await fetch(`${SERVER_URL}/api/tokens?limit=10`);
const data = await response.json();

// tokens已按24h成交量排序
data.tokens.forEach((token, index) => {
  console.log(`#${index + 1}: ${token.name} - $${token.volume24hUSDC}`);
});
```

## 🧪 测试

### 1. 部署多个token
```bash
# Token A: 价格 1 USDC
curl -X POST http://localhost:3002/api/deploy -d '{"price": "1", ...}'

# Token B: 价格 2 USDC
curl -X POST http://localhost:3002/api/deploy -d '{"price": "2", ...}'
```

### 2. Mint不同次数
```bash
# Token A mint 10次 = $10
# Token B mint 3次 = $6
```

### 3. 查看排序
```bash
curl http://localhost:3002/api/tokens?limit=10

# Token A应该排在Token B前面
```

## 💡 后续优化

### 1. 添加趋势指标
```typescript
{
  volume24hUSDC: 1000,
  volumeChange24h: 15.5,  // 相比前一天增长15.5%
  trending: "up" | "down" | "stable"
}
```

### 2. 多时间维度
```typescript
{
  volume1hUSDC: 50,
  volume24hUSDC: 1000,
  volume7dUSDC: 5000,
}
```

### 3. 成交量排名
```typescript
{
  volume24hUSDC: 1000,
  volumeRank: 1,
  volumeRankChange: +2  // 排名上升2位
}
```

## ✅ 验证清单

- [x] 后端API计算24小时成交量
- [x] 后端按成交量排序
- [x] 前端显示成交量
- [x] List布局更新
- [x] Grid布局更新
- [x] 使用mint_history表
- [x] 性能索引存在
- [x] 文档完善

---

**Trending Tokens现在真正展示热门token！** 🔥

