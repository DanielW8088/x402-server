// Fee tiers in basis points (100 = 1%)
export const FEE_TIERS = {
  LOWEST: 100,    // 0.01%
  LOW: 500,       // 0.05%
  MEDIUM: 3000,   // 0.3%
  HIGH: 10000,    // 1%
} as const;

export const FEE_TIER_LABELS: Record<number, string> = {
  100: '0.01%',
  500: '0.05%',
  3000: '0.3%',
  10000: '1%',
};

// Common tick spacings for each fee tier
export const TICK_SPACINGS: Record<number, number> = {
  100: 1,
  500: 10,
  3000: 60,
  10000: 200,
};

// Max uint128 for collect all fees
export const MAX_UINT128 = BigInt('0xffffffffffffffffffffffffffffffff');

// Slippage tolerance (5%)
export const DEFAULT_SLIPPAGE = 5;

// Deadline buffer (30 minutes)
export const DEADLINE_BUFFER = 30 * 60;

