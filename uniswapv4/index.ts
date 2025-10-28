import {
  type Address,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  getAddress,
  http,
  parseAbi,
} from "viem";
import {
  TickMath,
  encodeSqrtRatioX96,
  Pool, // ← add
  Position, // ← add
  nearestUsableTick, // optional if you switch to nearest snapping
} from "@uniswap/v3-sdk";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia, base } from "viem/chains";
import JSBI from "jsbi";
import { Token } from "@uniswap/sdk-core";

// ====== Config ======
const USE_BASE_SEPOLIA = true; // flip to false for Base mainnet

// Official Uniswap v3 addresses (from docs)
const NPM: Address = USE_BASE_SEPOLIA
  ? ("0x27F971cb582BF9E50F397e4d29a5C7A34f11faA2" as Address) // Base Sepolia NonfungiblePositionManager
  : ("0x03a520b32C04BF3bEEf7BEb72E919cf822Ed34f1" as Address); // Base mainnet NPM

const PERMIT2: Address = "0x000000000022D473030F116dDEE9F6B43aC78BA3"; // same on Base & Base Sepolia
// (Factory is not required for this flow, but listed on docs page if you need it)
// Docs: https://docs.uniswap.org/contracts/v3/reference/deployments/base-deployments

// ====== Minimal ABIs ======
const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function decimals() view returns (uint8)",
]);

const npmAbi = parseAbi([
  "function createAndInitializePoolIfNecessary(address token0, address token1, uint24 fee, uint160 sqrtPriceX96) external payable returns (address pool)",
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) external payable returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)",
]);

// Optional: Permit2 “AllowanceTransfer.approve(token, spender, amount, expiration)”
const permit2ApproveAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "spender", type: "address" },
      { name: "amount", type: "uint160" },
      { name: "expiration", type: "uint48" },
    ],
    outputs: [],
  },
] as const;

// ====== Helpers ======
function spacingForFee(fee: number) {
  if (fee === 100) return 1;
  if (fee === 500) return 10;
  if (fee === 3000) return 60;
  if (fee === 10000) return 200;
  throw new Error(`Unsupported fee tier: ${fee}`);
}
function sortTokens(a: Address, b: Address): [Address, Address] {
  return BigInt(a) < BigInt(b) ? ([a, b] as const) : ([b, a] as const);
}
function alignFullRangeTicks(tickSpacing: number): { lower: number; upper: number } {
  // true alignment to avoid shrinking the full range
  const min = Math.ceil(TickMath.MIN_TICK / tickSpacing) * tickSpacing;
  const max = Math.floor(TickMath.MAX_TICK / tickSpacing) * tickSpacing;
  return { lower: min, upper: max };
}

// ---- sample params (Base Sepolia) ----
const CHAIN = USE_BASE_SEPOLIA ? baseSepolia : base;
const RPC = USE_BASE_SEPOLIA ? "https://sepolia.base.org" : process.env.BASE_RPC_URL || "https://mainnet.base.org"; // set your mainnet RPC if needed

// Replace with your deployer key
const lpAccount = privateKeyToAccount(LP_DEPLOYER_PK as `0x${string}`);

// Example addresses (Base Sepolia):
const launchedToken = getAddress("0x720118758647120104cdd76386484E5c0c286517"); // your token (token1 conceptually)
const usdc = getAddress("0x036CbD53842c5426634e7929541eC2318f3dCF7e"); // test USDC (token0 conceptually)

const poolFee = 10_000; // 1.0% fee tier; pick 100 / 500 / 3000 / 10000

let publicClient: any = createPublicClient({ chain: CHAIN, transport: http(RPC) });
let walletClient: any = createWalletClient({ chain: CHAIN, transport: http(RPC), account: lpAccount });

// ====== Entrypoint to test quickly ======
async function main() {
  const res = await deployLP(
    launchedToken,
    "0x402",
    "0X402",
    poolFee,
    usdc,
    BigInt(5000000),
    BigInt(1000000000),
    1 // retries
  );

  console.log("✅ Result:", res);
}

type Pub = ReturnType<typeof createPublicClient>;
type Wal = ReturnType<typeof createWalletClient>;

/**
 * Pure v3-periphery flow: initialize via NPM, then mint full-range LP.
 */
export async function deployLP(
  tokenAddress: `0x${string}`, // your token
  name: string,
  symbol: string,
  poolFee: number,
  paymentTokenAddress: `0x${string}`, // USDC
  usdcAmountToDeployLP: bigint, // USDC side for LP
  tokenAmountToDeployLP: bigint, // token side for LP
  retryCount: number
) {
  const account = walletClient.account!.address as Address;

  // Fetch decimals
  const [decToken, decUSDC] = await Promise.all([
    publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "decimals" }) as Promise<number>,
    publicClient.readContract({
      address: paymentTokenAddress,
      abi: erc20Abi,
      functionName: "decimals",
    }) as Promise<number>,
  ]);

  // Sort tokens for pool’s token0/token1 order
  const [token0, token1] = sortTokens(paymentTokenAddress, tokenAddress);
  const token0IsUSDC = token0.toLowerCase() === paymentTokenAddress.toLowerCase();

  // Desired amounts in token0/token1 order
  const amount0Desired = token0IsUSDC ? usdcAmountToDeployLP : tokenAmountToDeployLP;
  const amount1Desired = token0IsUSDC ? tokenAmountToDeployLP : usdcAmountToDeployLP;

  // Initial price (Q64.96) from integer ratio (token1/token0):
  const sqrtPriceX96 = token0IsUSDC
    ? encodeSqrtRatioX96(JSBI.BigInt(usdcAmountToDeployLP.toString()), JSBI.BigInt(tokenAmountToDeployLP.toString()))
    : encodeSqrtRatioX96(JSBI.BigInt(tokenAmountToDeployLP.toString()), JSBI.BigInt(usdcAmountToDeployLP.toString()));

  // Full-range ticks aligned to spacing
  const tickSpacing = spacingForFee(poolFee);
  const { lower: tickLower, upper: tickUpper } = alignFullRangeTicks(tickSpacing);

  // --- Approvals ---
  // v3 periphery only needs ERC20 -> NPM approvals.
  // (Permit2 path is optional; leaving a snippet below if you prefer that style.)
  const allowances = await Promise.all([
    publicClient.readContract({
      address: token0,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account, NPM],
    }) as Promise<bigint>,
    publicClient.readContract({
      address: token1,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account, NPM],
    }) as Promise<bigint>,
  ]);
  const MAX = 2n ** 256n - 1n;

  if (allowances[0] < amount0Desired) {
    await walletClient.writeContract({ address: token0, abi: erc20Abi, functionName: "approve", args: [NPM, MAX] });
  }
  if (allowances[1] < amount1Desired) {
    await walletClient.writeContract({ address: token1, abi: erc20Abi, functionName: "approve", args: [NPM, MAX] });
  }

  // (Optional Permit2 style)
  // const MAX160 = 2n ** 160n - 1n, MAX48 = 2n ** 48n - 1n;
  // await walletClient.writeContract({ address: PERMIT2, abi: permit2ApproveAbi, functionName: "approve", args: [token0, NPM, MAX160, MAX48] });
  // await walletClient.writeContract({ address: PERMIT2, abi: permit2ApproveAbi, functionName: "approve", args: [token1, NPM, MAX160, MAX48] });

  // --- Create & initialize the pool ---
  await walletClient.writeContract({
    address: NPM,
    abi: npmAbi,
    functionName: "createAndInitializePoolIfNecessary",
    args: [token0, token1, poolFee as any, BigInt(sqrtPriceX96.toString())],
  });

  console.log("✅ Pool created & initialized");

  const tickCurrent = TickMath.getTickAtSqrtRatio(sqrtPriceX96);
  const pool = new Pool(
    // token0 then token1 in the pool’s sort order:
    token0IsUSDC
      ? new Token(8453, paymentTokenAddress, decUSDC, "USDC", "USD Coin")
      : new Token(8453, tokenAddress, decToken, symbol, name),
    token0IsUSDC
      ? new Token(8453, tokenAddress, decToken, symbol, name)
      : new Token(8453, paymentTokenAddress, decUSDC, "USDC", "USD Coin"),
    poolFee,
    sqrtPriceX96.toString(),
    JSBI.BigInt(0), // initial liquidity 0 for a fresh pool
    tickCurrent
  );
  // Compute the *expected* amounts the mint will actually consume
  const position = Position.fromAmounts({
    pool,
    tickLower,
    tickUpper,
    amount0: amount0Desired.toString(),
    amount1: amount1Desired.toString(),
    useFullPrecision: true,
  });

  // These are JSBI; convert to bigint for the tx
  const mintAmt0 = BigInt(position.mintAmounts.amount0.toString());
  const mintAmt1 = BigInt(position.mintAmounts.amount1.toString());

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60); // 30 min

  // Choose a small tolerance. 0.5% is usually safe for freshly initialized pools.
  const SLIPPAGE_BPS = 100n; // = 1%

  // amountMin = computedMintAmount * (1 - slippage)
  const amount0Min = (mintAmt0 * (10_000n - SLIPPAGE_BPS)) / 10_000n;
  const amount1Min = (mintAmt1 * (10_000n - SLIPPAGE_BPS)) / 10_000n;
  let lastError: unknown = null;
  for (let i = 0; i <= Math.max(0, retryCount); i++) {
    try {
      const txHash = await walletClient.writeContract({
        address: NPM,
        abi: npmAbi,
        functionName: "mint",
        args: [
          {
            token0,
            token1,
            fee: poolFee as any,
            tickLower,
            tickUpper,
            amount0Desired,
            amount1Desired,
            amount0Min,
            amount1Min,
            recipient: account,
            deadline,
          },
        ],
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return {
        txHash,
        blockNumber: receipt.blockNumber,
        pool: { token0, token1, fee: poolFee, sqrtPriceX96: sqrtPriceX96.toString() },
        ticks: { tickLower, tickUpper },
        desired: { amount0Desired: amount0Desired.toString(), amount1Desired: amount1Desired.toString() },
      };
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 1200));
    }
  }
  throw new Error(`Failed to mint LP after ${retryCount + 1} tries: ${String(lastError)}`);
}

// Run if invoked directly
if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
