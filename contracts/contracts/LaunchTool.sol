// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.4.16 ^0.8.0 ^0.8.13 ^0.8.28;

import {IUniswapV3Factory} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Factory.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {INonfungiblePositionManager} from "@uniswap/v3-periphery/contracts/interfaces/INonfungiblePositionManager.sol";
import {TickMath} from "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title LaunchTool
 * @notice Tool for creating and initializing Uniswap V3 pools with liquidity
 * @dev This contract helps users create new pools and add initial liquidity in one transaction
 */
contract LaunchTool {
    using TickMath for int24;

    IUniswapV3Factory public immutable uniswapV3Factory;
    INonfungiblePositionManager public immutable positionManager;
    address public admin;

    // Events
    event PoolConfigured(
        address indexed pool,
        address indexed token0,
        address indexed token1,
        uint256 positionId,
        uint128 liquidity
    );
    event TokenWithdrawn(
        address indexed token,
        address indexed to,
        uint256 amount
    );
    event AdminChanged(address indexed oldAdmin, address indexed newAdmin);

    // Errors
    error TokenOrderingError();
    error SameTokenError();
    error InvalidTickRange();
    error ZeroAmountError();
    error PoolAlreadyExists();
    error OnlyAdmin();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert OnlyAdmin();
        _;
    }

    constructor(
        address _uniswapV3Factory,
        address _positionManager,
        address _admin
    ) {
        require(_uniswapV3Factory != address(0), "Invalid factory address");
        require(
            _positionManager != address(0),
            "Invalid position manager address"
        );
        require(_admin != address(0), "Invalid admin address");

        uniswapV3Factory = IUniswapV3Factory(_uniswapV3Factory);
        positionManager = INonfungiblePositionManager(_positionManager);
        admin = _admin;
    }

    /**
     * @notice Configure a new Uniswap V3 pool by creating it, initializing, and adding liquidity
     * @param token0 Address of token0 (must be < token1)
     * @param token1 Address of token1 (must be > token0)
     * @param token0Amount Amount of token0 to add as liquidity
     * @param token1Amount Amount of token1 to add as liquidity
     * @param sqrtPriceX96 Initial sqrt price in Q64.96 format
     * @param tickLower Lower tick boundary for liquidity position
     * @param tickUpper Upper tick boundary for liquidity position
     * @param fee Fee tier (500, 3000, 10000 for 0.05%, 0.3%, 1%)
     * @return positionId The NFT token ID representing the liquidity position
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
    ) external returns (uint256 positionId) {
        // Validate inputs
        if (token0 == token1) revert SameTokenError();
        if (token0 >= token1) revert TokenOrderingError();
        if (token0Amount == 0 || token1Amount == 0) revert ZeroAmountError();
        if (tickLower >= tickUpper) revert InvalidTickRange();
        if (tickLower < TickMath.MIN_TICK || tickUpper > TickMath.MAX_TICK) {
            revert InvalidTickRange();
        }

        // Check if pool already exists
        address existingPool = uniswapV3Factory.getPool(token0, token1, fee);
        address pool;

        if (existingPool == address(0)) {
            // Create new pool
            pool = uniswapV3Factory.createPool(token0, token1, fee);
            // Initialize pool with starting price
            IUniswapV3Pool(pool).initialize(sqrtPriceX96);
        } else {
            revert PoolAlreadyExists();
        }

        // Transfer tokens from user to this contract
        IERC20(token0).transferFrom(msg.sender, address(this), token0Amount);
        IERC20(token1).transferFrom(msg.sender, address(this), token1Amount);

        // Approve position manager to spend tokens
        IERC20(token0).approve(address(positionManager), token0Amount);
        IERC20(token1).approve(address(positionManager), token1Amount);

        // Prepare mint parameters with 1% slippage tolerance
        INonfungiblePositionManager.MintParams
            memory params = INonfungiblePositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: fee,
                tickLower: tickLower,
                tickUpper: tickUpper,
                amount0Desired: token0Amount,
                amount1Desired: token1Amount,
                amount0Min: (token0Amount * 99) / 100,
                amount1Min: (token1Amount * 99) / 100,
                recipient: msg.sender,
                deadline: block.timestamp
            });

        // Mint liquidity position
        uint128 liquidity;
        (positionId, liquidity, , ) = positionManager.mint(params);

        emit PoolConfigured(pool, token0, token1, positionId, liquidity);

        return positionId;
    }

    /**
     * @notice Configure pool with custom slippage protection
     * @param token0 Address of token0 (must be < token1)
     * @param token1 Address of token1 (must be > token0)
     * @param token0Amount Amount of token0 to add as liquidity
     * @param token1Amount Amount of token1 to add as liquidity
     * @param token0Min Minimum amount of token0 to add (slippage protection)
     * @param token1Min Minimum amount of token1 to add (slippage protection)
     * @param sqrtPriceX96 Initial sqrt price in Q64.96 format
     * @param tickLower Lower tick boundary for liquidity position
     * @param tickUpper Upper tick boundary for liquidity position
     * @param fee Fee tier
     * @return positionId The NFT token ID representing the liquidity position
     */
    function configurePoolByAmountWithSlippage(
        address token0,
        address token1,
        uint256 token0Amount,
        uint256 token1Amount,
        uint256 token0Min,
        uint256 token1Min,
        uint160 sqrtPriceX96,
        int24 tickLower,
        int24 tickUpper,
        uint24 fee
    ) external returns (uint256 positionId) {
        // Validate inputs
        if (token0 == token1) revert SameTokenError();
        if (token0 >= token1) revert TokenOrderingError();
        if (token0Amount == 0 || token1Amount == 0) revert ZeroAmountError();
        if (tickLower >= tickUpper) revert InvalidTickRange();

        // Check if pool already exists
        address existingPool = uniswapV3Factory.getPool(token0, token1, fee);
        address pool;

        if (existingPool == address(0)) {
            pool = uniswapV3Factory.createPool(token0, token1, fee);
            IUniswapV3Pool(pool).initialize(sqrtPriceX96);
        } else {
            revert PoolAlreadyExists();
        }

        // Transfer tokens from user
        IERC20(token0).transferFrom(msg.sender, address(this), token0Amount);
        IERC20(token1).transferFrom(msg.sender, address(this), token1Amount);

        // Approve position manager
        IERC20(token0).approve(address(positionManager), token0Amount);
        IERC20(token1).approve(address(positionManager), token1Amount);

        INonfungiblePositionManager.MintParams
            memory params = INonfungiblePositionManager.MintParams({
                token0: token0,
                token1: token1,
                fee: fee,
                tickLower: tickLower,
                tickUpper: tickUpper,
                amount0Desired: token0Amount,
                amount1Desired: token1Amount,
                amount0Min: token0Min,
                amount1Min: token1Min,
                recipient: msg.sender,
                deadline: block.timestamp
            });

        uint128 liquidity;
        (positionId, liquidity, , ) = positionManager.mint(params);

        emit PoolConfigured(pool, token0, token1, positionId, liquidity);

        return positionId;
    }

    /**
     * @notice Withdraw tokens from contract (emergency function)
     * @param token Address of token to withdraw
     * @param amount Amount to withdraw
     */
    function withdrawToken(address token, uint256 amount) external onlyAdmin {
        IERC20(token).transfer(admin, amount);
        emit TokenWithdrawn(token, admin, amount);
    }

    /**
     * @notice Change admin address
     * @param newAdmin New admin address
     */
    function changeAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Invalid new admin");
        address oldAdmin = admin;
        admin = newAdmin;
        emit AdminChanged(oldAdmin, newAdmin);
    }
}
