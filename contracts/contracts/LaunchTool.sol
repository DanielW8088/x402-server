// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/* ----------------------------- Uniswap V3 Math ----------------------------- */
library TickMath {
    error T();
    error R();

    int24 internal constant MIN_TICK = -887272;
    int24 internal constant MAX_TICK = -MIN_TICK;

    uint160 internal constant MIN_SQRT_RATIO = 4295128739;
    uint160 internal constant MAX_SQRT_RATIO =
        1461446703485210103287273052203988822378723970342;

    /// @notice Calculates sqrt(1.0001^tick) * 2^96
    function getSqrtRatioAtTick(int24 tick) internal pure returns (uint160 sqrtPriceX96) {
        unchecked {
            uint256 absTick = tick < 0 ? uint256(-int256(tick)) : uint256(int256(tick));
            if (absTick > uint256(int256(MAX_TICK))) revert T();

            uint256 ratio = absTick & 0x1 != 0
                ? 0xfffcb933bd6fad37aa2d162d1a594001
                : 0x100000000000000000000000000000000;
            if (absTick & 0x2 != 0)  ratio = (ratio * 0xfff97272373d413259a46990580e213a) >> 128;
            if (absTick & 0x4 != 0)  ratio = (ratio * 0xfff2e50f5f656932ef12357cf3c7fdcc) >> 128;
            if (absTick & 0x8 != 0)  ratio = (ratio * 0xffe5caca7e10e4e61c3624eaa0941cd0) >> 128;
            if (absTick & 0x10 != 0) ratio = (ratio * 0xffcb9843d60f6159c9db58835c926644) >> 128;
            if (absTick & 0x20 != 0) ratio = (ratio * 0xff973b41fa98c081472e6896dfb254c0) >> 128;
            if (absTick & 0x40 != 0) ratio = (ratio * 0xff2ea16466c96a3843ec78b326b52861) >> 128;
            if (absTick & 0x80 != 0) ratio = (ratio * 0xfe5dee046a99a2a811c461f1969c3053) >> 128;
            if (absTick & 0x100 != 0) ratio = (ratio * 0xfcbe86c7900a88aedcffc83b479aa3a4) >> 128;
            if (absTick & 0x200 != 0) ratio = (ratio * 0xf987a7253ac413176f2b074cf7815e54) >> 128;
            if (absTick & 0x400 != 0) ratio = (ratio * 0xf3392b0822b70005940c7a398e4b70f3) >> 128;
            if (absTick & 0x800 != 0) ratio = (ratio * 0xe7159475a2c29b7443b29c7fa6e889d9) >> 128;
            if (absTick & 0x1000 != 0) ratio = (ratio * 0xd097f3bdfd2022b8845ad8f792aa5825) >> 128;
            if (absTick & 0x2000 != 0) ratio = (ratio * 0xa9f746462d870fdf8a65dc1f90e061e5) >> 128;
            if (absTick & 0x4000 != 0) ratio = (ratio * 0x70d869a156d2a1b890bb3df62baf32f7) >> 128;
            if (absTick & 0x8000 != 0) ratio = (ratio * 0x31be135f97d08fd981231505542fcfa6) >> 128;
            if (absTick & 0x10000 != 0) ratio = (ratio * 0x9aa508b5b7a84e1c677de54f3e99bc9) >> 128;
            if (absTick & 0x20000 != 0) ratio = (ratio * 0x5d6af8dedb81196699c329225ee604) >> 128;
            if (absTick & 0x40000 != 0) ratio = (ratio * 0x2216e584f5fa1ea926041bedfe98) >> 128;
            if (absTick & 0x80000 != 0) ratio = (ratio * 0x48a170391f7dc42444e8fa2) >> 128;

            if (tick > 0) ratio = type(uint256).max / ratio;

            sqrtPriceX96 = uint160((ratio >> 32) + (ratio % (1 << 32) == 0 ? 0 : 1));
        }
    }

    /// @notice Calculates tick for a given sqrt price
    function getTickAtSqrtRatio(uint160 sqrtPriceX96) internal pure returns (int24 tick) {
        unchecked {
            if (!(sqrtPriceX96 >= MIN_SQRT_RATIO && sqrtPriceX96 < MAX_SQRT_RATIO)) revert R();
            uint256 ratio = uint256(sqrtPriceX96) << 32;

            uint256 r = ratio;
            uint256 msb = 0;

            assembly { let f := shl(7, gt(r, 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF)) msb := or(msb, f) r := shr(f, r) }
            assembly { let f := shl(6, gt(r, 0xFFFFFFFFFFFFFFFF)) msb := or(msb, f) r := shr(f, r) }
            assembly { let f := shl(5, gt(r, 0xFFFFFFFF)) msb := or(msb, f) r := shr(f, r) }
            assembly { let f := shl(4, gt(r, 0xFFFF)) msb := or(msb, f) r := shr(f, r) }
            assembly { let f := shl(3, gt(r, 0xFF)) msb := or(msb, f) r := shr(f, r) }
            assembly { let f := shl(2, gt(r, 0xF)) msb := or(msb, f) r := shr(f, r) }
            assembly { let f := shl(1, gt(r, 0x3)) msb := or(msb, f) r := shr(f, r) }
            assembly { let f := gt(r, 0x1) msb := or(msb, f) }

            if (msb >= 128) r = ratio >> (msb - 127);
            else r = ratio << (127 - msb);

            int256 log_2 = (int256(msb) - 128) << 64;

            assembly { r := shr(127, mul(r, r)) let f := shr(128, r) log_2 := or(log_2, shl(63, f)) r := shr(f, r) }
            assembly { r := shr(127, mul(r, r)) let f := shr(128, r) log_2 := or(log_2, shl(62, f)) r := shr(f, r) }
            assembly { r := shr(127, mul(r, r)) let f := shr(128, r) log_2 := or(log_2, shl(61, f)) r := shr(f, r) }
            assembly { r := shr(127, mul(r, r)) let f := shr(128, r) log_2 := or(log_2, shl(60, f)) r := shr(f, r) }
            assembly { r := shr(127, mul(r, r)) let f := shr(128, r) log_2 := or(log_2, shl(59, f)) r := shr(f, r) }
            assembly { r := shr(127, mul(r, r)) let f := shr(128, r) log_2 := or(log_2, shl(58, f)) r := shr(f, r) }
            assembly { r := shr(127, mul(r, r)) let f := shr(128, r) log_2 := or(log_2, shl(57, f)) r := shr(f, r) }
            assembly { r := shr(127, mul(r, r)) let f := shr(128, r) log_2 := or(log_2, shl(56, f)) r := shr(f, r) }
            assembly { r := shr(127, mul(r, r)) let f := shr(128, r) log_2 := or(log_2, shl(55, f)) r := shr(f, r) }
            assembly { r := shr(127, mul(r, r)) let f := shr(128, r) log_2 := or(log_2, shl(54, f)) r := shr(f, r) }
            assembly { r := shr(127, mul(r, r)) let f := shr(128, r) log_2 := or(log_2, shl(53, f)) r := shr(f, r) }
            assembly { r := shr(127, mul(r, r)) let f := shr(128, r) log_2 := or(log_2, shl(52, f)) r := shr(f, r) }
            assembly { r := shr(127, mul(r, r)) let f := shr(128, r) log_2 := or(log_2, shl(51, f)) r := shr(f, r) }
            assembly { r := shr(127, mul(r, r)) let f := shr(128, r) log_2 := or(log_2, shl(50, f)) }

            int256 log_sqrt10001 = log_2 * 255738958999603826347141;

            int24 tickLow = int24((log_sqrt10001 - 3402992956809132418596140100660247210) >> 128);
            int24 tickHi  = int24((log_sqrt10001 + 291339464771989622907027621153398088495) >> 128);

            tick = tickLow == tickHi ? tickLow : getSqrtRatioAtTick(tickHi) <= sqrtPriceX96 ? tickHi : tickLow;
        }
    }
}

/* ---------------------------- Uniswap V3 Interfaces ---------------------------- */
interface INonfungiblePositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24  fee;
        int24   tickLower;
        int24   tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    function mint(MintParams calldata params)
        external payable
        returns (uint256 tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
}

interface IUniswapV3Factory {
    function createPool(address tokenA, address tokenB, uint24 fee) external returns (address pool);
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool);
}

interface IUniswapV3Pool {
    function initialize(uint160 sqrtPriceX96) external;
    function slot0()
        external view
        returns (
            uint160 sqrtPriceX96,
            int24  tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8  feeProtocol,
            bool   unlocked
        );
    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee()    external view returns (uint24);
}

/* --------------------------------- LaunchTool --------------------------------- */
contract LaunchTool {
    using SafeERC20 for IERC20;

    /* ------------------------------- Immutables ------------------------------- */
    IUniswapV3Factory public immutable factory;
    INonfungiblePositionManager public immutable positionManager;
    address public admin;

    /* --------------------------------- Events -------------------------------- */
    event PoolConfigured(address indexed pool, address indexed token0, address indexed token1, uint256 positionId, uint128 liquidity);
    event TokenWithdrawn(address indexed token, address indexed to, uint256 amount);
    event AdminChanged(address indexed oldAdmin, address indexed newAdmin);
    /// @notice Snapshot of balances and allowances right before mint
    event DebugSnapshot(uint256 bal0, uint256 bal1, uint256 app0, uint256 app1);

    /* --------------------------------- Errors -------------------------------- */
    error OnlyAdmin();
    error SameToken();
    error TokenOrder();
    error ZeroAmount();
    error InvalidTicks();
    error PriceOutOfRange();

    /* -------------------------------- Modifier -------------------------------- */
    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    /* ------------------------------- Constructor ------------------------------ */
    constructor(address _factory, address _pm, address _admin) {
        require(_factory != address(0) && _pm != address(0) && _admin != address(0), "zero addr");
        factory = IUniswapV3Factory(_factory);
        positionManager = INonfungiblePositionManager(_pm);
        admin = _admin;
    }

    /* ------------------------------ Admin Update ------------------------------ */
    function changeAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "zero");
        address old = admin;
        admin = newAdmin;
        emit AdminChanged(old, newAdmin);
    }

    /* ----------------------------- Internal Helpers --------------------------- */

    /// @notice Approve `spender` for `token` up to max if current allowance < needed
    function _approveMax(IERC20 token, address spender, uint256 need) internal {
        uint256 cur = token.allowance(address(this), spender);
        if (cur < need) {
            // Use forceApprove (replaces deprecated safeApprove)
            token.forceApprove(spender, type(uint256).max);
        }
    }

    /// @notice Pull tokens from admin (msg.sender) into this contract and assert receipt
    function _pullIn(IERC20 t0, IERC20 t1, uint256 a0, uint256 a1) internal {
        if (a0 == 0 || a1 == 0) revert ZeroAmount();
        t0.safeTransferFrom(msg.sender, address(this), a0);
        t1.safeTransferFrom(msg.sender, address(this), a1);

        uint256 b0 = t0.balanceOf(address(this));
        uint256 b1 = t1.balanceOf(address(this));
        require(b0 >= a0 && b1 >= a1, "not received");
    }

    /// @notice Reverts if sqrtPriceX96 is out of Uniswap V3 representable range
    function _ensureSqrtInRange(uint160 sqrtPriceX96) internal pure {
        if (sqrtPriceX96 <= TickMath.MIN_SQRT_RATIO || sqrtPriceX96 >= TickMath.MAX_SQRT_RATIO) {
            revert PriceOutOfRange();
        }
    }

    /// @notice Initialize the pool if not initialized (sqrtPriceX96 == 0)
    function _initializeIfNeeded(address pool, uint160 sqrtPriceX96) internal {
        (uint160 cur,, , , , ,) = IUniswapV3Pool(pool).slot0();
        if (cur == 0) {
            IUniswapV3Pool(pool).initialize(sqrtPriceX96);
        }
    }

    /* --------------------------- Public Core Functions ------------------------ */

    /**
     * @notice Create (if missing), initialize (if needed), and mint a position.
     * @dev Requirements:
     *      - token0 < token1 by address order
     *      - amounts must be in smallest units
     *      - tickLower < tickUpper and both within Uniswap V3 bounds
     *      - sqrtPriceX96 must be within TickMath bounds
     */
    function upsertAndMint(
        address token0,
        address token1,
        uint24  fee,
        uint160 sqrtPriceX96,
        int24   tickLower,
        int24   tickUpper,
        uint256 amount0Desired,
        uint256 amount1Desired
    ) external onlyAdmin returns (uint256 positionId, uint128 liquidity, address pool) {
        if (token0 == token1) revert SameToken();
        if (token0 >= token1) revert TokenOrder();
        if (tickLower >= tickUpper) revert InvalidTicks();
        if (tickLower < TickMath.MIN_TICK || tickUpper > TickMath.MAX_TICK) revert InvalidTicks();
        _ensureSqrtInRange(sqrtPriceX96);

        // 1) Create or fetch pool
        pool = factory.getPool(token0, token1, fee);
        if (pool == address(0)) {
            pool = factory.createPool(token0, token1, fee);
        }

        // 2) Initialize if not initialized
        _initializeIfNeeded(pool, sqrtPriceX96);

        // 3) Pull funds to this contract (reverts if not received)
        IERC20 t0 = IERC20(token0);
        IERC20 t1 = IERC20(token1);
        _pullIn(t0, t1, amount0Desired, amount1Desired);

        // 4) Approve PM (max) and snapshot
        _approveMax(t0, address(positionManager), amount0Desired);
        _approveMax(t1, address(positionManager), amount1Desired);

        emit DebugSnapshot(
            t0.balanceOf(address(this)),
            t1.balanceOf(address(this)),
            t0.allowance(address(this), address(positionManager)),
            t1.allowance(address(this), address(positionManager))
        );

        // 5) Mint with 5% slippage buffer and 30-minute deadline
        uint256 a0min = amount0Desired - (amount0Desired / 20); // 95%
        uint256 a1min = amount1Desired - (amount1Desired / 20); // 95%
        if (a0min == 0 && amount0Desired > 0) a0min = 1;
        if (a1min == 0 && amount1Desired > 0) a1min = 1;

        INonfungiblePositionManager.MintParams memory p = INonfungiblePositionManager.MintParams({
            token0: token0,
            token1: token1,
            fee: fee,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: amount0Desired,
            amount1Desired: amount1Desired,
            amount0Min: a0min,
            amount1Min: a1min,
            recipient: msg.sender,
            deadline: block.timestamp + 30 minutes
        });

        (positionId, liquidity, , ) = positionManager.mint(p);

        emit PoolConfigured(pool, token0, token1, positionId, liquidity);
    }

    /**
     * @notice Create a new pool (must not exist), initialize it, then mint a position.
     * @dev Reverts if the pool already exists. Use when you explicitly require a fresh pool.
     */
    function configurePoolByAmount(
        address token0,
        address token1,
        uint256 token0Amount,
        uint256 token1Amount,
        uint160 sqrtPriceX96,
        int24 tickLower,
        int24 tickUpper,
        uint24 fee
    ) external onlyAdmin returns (uint256 positionId) {
        if (token0 == token1) revert SameToken();
        if (token0 >= token1) revert TokenOrder();
        if (token0Amount == 0 || token1Amount == 0) revert ZeroAmount();
        if (tickLower >= tickUpper) revert InvalidTicks();
        if (tickLower < TickMath.MIN_TICK || tickUpper > TickMath.MAX_TICK) revert InvalidTicks();
        _ensureSqrtInRange(sqrtPriceX96);

        address pool = factory.getPool(token0, token1, fee);
        require(pool == address(0), "pool already exists");

        // Create and initialize pool
        pool = factory.createPool(token0, token1, fee);
        IUniswapV3Pool(pool).initialize(sqrtPriceX96);

        // Pull funds & approve
        IERC20 t0 = IERC20(token0);
        IERC20 t1 = IERC20(token1);
        _pullIn(t0, t1, token0Amount, token1Amount);
        _approveMax(t0, address(positionManager), token0Amount);
        _approveMax(t1, address(positionManager), token1Amount);

        emit DebugSnapshot(
            t0.balanceOf(address(this)),
            t1.balanceOf(address(this)),
            t0.allowance(address(this), address(positionManager)),
            t1.allowance(address(this), address(positionManager))
        );

        // Mint
        uint256 a0min = token0Amount - (token0Amount / 20); // 95%
        uint256 a1min = token1Amount - (token1Amount / 20); // 95%
        if (a0min == 0 && token0Amount > 0) a0min = 1;
        if (a1min == 0 && token1Amount > 0) a1min = 1;

        INonfungiblePositionManager.MintParams memory p = INonfungiblePositionManager.MintParams({
            token0: token0,
            token1: token1,
            fee: fee,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: token0Amount,
            amount1Desired: token1Amount,
            amount0Min: a0min,
            amount1Min: a1min,
            recipient: msg.sender,
            deadline: block.timestamp + 30 minutes
        });

        uint128 liq;
        (positionId, liq, , ) = positionManager.mint(p);
        emit PoolConfigured(pool, token0, token1, positionId, liq);
    }

    /* --------------------------------- Emergency -------------------------------- */
    /// @notice Withdraw tokens accidentally stuck in the contract
    function withdrawToken(address token, uint256 amount) external onlyAdmin {
        IERC20(token).safeTransfer(admin, amount);
        emit TokenWithdrawn(token, admin, amount);
    }
}
