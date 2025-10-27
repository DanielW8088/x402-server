// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.4.0
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IPositionManager, PoolKey as PositionPoolKey} from "v4-periphery/src/interfaces/IPositionManager.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {LiquidityAmounts} from "v4-periphery/src/libraries/LiquidityAmounts.sol";
import {Actions} from "v4-periphery/src/libraries/Actions.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title PAYX
 * @notice Full-featured ERC20 token with x402 payment integration, EIP-3009 support, and Uniswap v4 auto-deployment
 * @dev Features:
 * - EIP-3009: Gasless transfers via meta-transactions
 * - x402: Pay USDC to mint tokens
 * - Uniswap v4: Automatic liquidity deployment when max mint count is reached
 * - Supply cap: Maximum 1 billion tokens
 */
contract PAYX is ERC20, ERC20Burnable, AccessControl, EIP712, Ownable {
    // ==================== Errors ====================
    
    /// @notice The error thrown when the array length mismatch
    error ArrayLengthMismatch();
    /// @notice The error thrown when the tx hash has already been minted
    error AlreadyMinted(address to, bytes32 txHash);
    /// @notice The error thrown when the mint count exceeds the maximum mint count
    error MaxMintCountExceeded();
    /// @notice The error thrown when minting would exceed the maximum supply
    error MaxSupplyExceeded();

    // --- EIP-3009 specific errors ---
    error AuthorizationStateInvalid(address authorizer, bytes32 nonce);
    error AuthorizationExpired(uint256 nowTime, uint256 validBefore);
    error AuthorizationNotYetValid(uint256 nowTime, uint256 validAfter);
    error InvalidSigner(address signer, address expected);
    error InvalidRecipient(address to);

    // ==================== Events ====================
    
    /// @notice Emitted when tokens are minted to a user
    event TokensMinted(address indexed to, uint256 amount, bytes32 txHash);
    /// @notice Emitted when the position manager mints the protocol-owned LP token
    event LiquidityDeployed(uint256 tokenId, uint128 liquidity);
    /// @notice Emitted when fees are collected from the protocol-owned LP position
    event FeesCollected(address recipient, uint256 amountToken0, uint256 amountToken1);

    // --- EIP-3009 events ---
    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);

    // ==================== Constants ====================

    /// @notice Maximum total supply of tokens (2 billion tokens with 18 decimals)
    uint256 public constant MAX_SUPPLY = 2_000_000_000 * 10**18;

    /// @notice Role identifier for minters (typically the x402 payment server)
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // --- EIP-3009 typehashes (per spec) ---
    bytes32 private constant _TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    bytes32 private constant _RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );

    bytes32 private constant _CANCEL_AUTHORIZATION_TYPEHASH =
        keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");

    // ==================== Immutable State ====================

    /// @notice The pool manager (Uniswap v4 PoolManager)
    IPoolManager internal immutable POOL_MANAGER;

    /// @notice The PositionManager for managing liquidity NFTs
    IPositionManager internal immutable POSITION_MANAGER;

    /// @notice Permit2 for token approvals
    IAllowanceTransfer internal immutable PERMIT2;

    /// @notice The payment token (e.g., USDC)
    address internal immutable PAYMENT_TOKEN;

    /// @notice The total payment token amount for liquidity pool seeding
    uint256 internal immutable PAYMENT_SEED;

    /// @notice The pool seed amount (tokens for liquidity)
    uint256 internal immutable POOL_SEED_AMOUNT;

    /// @notice The amount of tokens to mint per payment
    uint256 public immutable MINT_AMOUNT;

    /// @notice The maximum number of mints allowed
    uint256 public immutable MAX_MINT_COUNT;

    /// @notice Constant sqrtPriceX96 when payment token precedes this token
    uint160 internal immutable SQRT_PRICE_PAYMENT_TOKEN_FIRST;

    /// @notice Constant sqrtPriceX96 when this token precedes payment token
    uint160 internal immutable SQRT_PRICE_TOKEN_FIRST;

    /// @notice Cached sorted token ordering flag (true when payment token < this token)
    bool internal immutable PAYMENT_TOKEN_IS_TOKEN0;

    // ==================== Mutable State ====================

    /// @notice The current number of mints executed
    uint256 private _mintCount;

    /// @notice Tracks which tx hashes have already been minted
    mapping(bytes32 => bool) public hasMinted;

    /// @notice EIP-3009 authorization state tracking (0 = Unused, 1 = Used, 2 = Canceled)
    mapping(address => mapping(bytes32 => uint8)) private _authorizationStates;

    /// @notice The lp guard hook
    address internal lpGuardHook;

    /// @notice Token ID for the protocol-owned LP position
    uint256 internal _lpTokenId;

    /// @notice Flag indicating whether liquidity has been deployed
    bool internal _liquidityDeployed;

    /// @notice Flag indicating whether emergency withdraw has been used
    bool internal _emergencyWithdrawUsed;

    // ==================== Constructor ====================

    constructor(
        string memory name,
        string memory symbol,
        uint256 _mintAmount,
        uint256 _maxMintCount,
        IPoolManager _poolManager,
        IPositionManager _positionManager,
        IAllowanceTransfer _permit2,
        address _paymentToken,
        uint256 _paymentSeed,
        uint256 _poolSeedAmount,
        uint160 _sqrtPricePaymentFirst,
        uint160 _sqrtPriceTokenFirst
    ) ERC20(name, symbol) EIP712(name, "1") Ownable(msg.sender) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        
        MINT_AMOUNT = _mintAmount;
        MAX_MINT_COUNT = _maxMintCount;
        POOL_MANAGER = _poolManager;
        POSITION_MANAGER = _positionManager;
        PERMIT2 = _permit2;
        PAYMENT_TOKEN = _paymentToken;
        PAYMENT_SEED = _paymentSeed;
        POOL_SEED_AMOUNT = _poolSeedAmount;

        bool paymentTokenIsToken0 = _paymentToken < address(this);
        PAYMENT_TOKEN_IS_TOKEN0 = paymentTokenIsToken0;

        SQRT_PRICE_PAYMENT_TOKEN_FIRST = _sqrtPricePaymentFirst;
        SQRT_PRICE_TOKEN_FIRST = _sqrtPriceTokenFirst;

        // Pre-mint LP seed amount to contract on deployment
        _mint(address(this), _poolSeedAmount);
    }

    // ==================== EIP-3009 Public Interface ====================

    /// @notice EIP-712 domain separator (for compatibility with offchain tooling)
    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    /// @notice Returns authorization state for a given authorizer & nonce
    /// @return true if Used or Canceled, false if Unused
    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool) {
        return _authorizationStates[authorizer][nonce] != 0;
    }

    /// @notice Execute an ERC20 transfer signed by `from`
    function transferWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (bool) {
        _validateTimeframe(validAfter, validBefore);
        _useAuthorization(from, nonce);

        bytes32 structHash = keccak256(
            abi.encode(_TRANSFER_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce)
        );
        _requireValidSignature(from, structHash, v, r, s);

        _transfer(from, to, value);
        return true;
    }

    /// @notice Execute a transfer to the caller, preventing front-running
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external returns (bool) {
        if (to != msg.sender) revert InvalidRecipient(to);

        _validateTimeframe(validAfter, validBefore);
        _useAuthorization(from, nonce);

        bytes32 structHash = keccak256(
            abi.encode(_RECEIVE_WITH_AUTHORIZATION_TYPEHASH, from, to, value, validAfter, validBefore, nonce)
        );
        _requireValidSignature(from, structHash, v, r, s);

        _transfer(from, to, value);
        return true;
    }

    /// @notice Cancel a previously issued authorization (that hasn't been used yet)
    function cancelAuthorization(address authorizer, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external {
        if (_authorizationStates[authorizer][nonce] != 0) {
            revert AuthorizationStateInvalid(authorizer, nonce);
        }

        bytes32 structHash = keccak256(abi.encode(_CANCEL_AUTHORIZATION_TYPEHASH, authorizer, nonce));
        _requireValidSignature(authorizer, structHash, v, r, s);

        _authorizationStates[authorizer][nonce] = 2; // Canceled
        emit AuthorizationCanceled(authorizer, nonce);
    }

    // ==================== Minting Logic ====================

    /// @notice Batch mints tokens to multiple addresses with unique txHashes
    /// @param to Array of addresses to mint tokens to
    /// @param txHashes Array of tx hashes to prevent double minting
    function batchMint(address[] memory to, bytes32[] memory txHashes) public onlyRole(MINTER_ROLE) {
        if (to.length != txHashes.length) {
            revert ArrayLengthMismatch();
        }

        if (_mintCount + to.length > MAX_MINT_COUNT) {
            revert MaxMintCountExceeded();
        }

        // Check if minting would exceed max supply
        uint256 totalMintAmount = MINT_AMOUNT * to.length;
        if (totalSupply() + totalMintAmount > MAX_SUPPLY) {
            revert MaxSupplyExceeded();
        }

        for (uint256 i = 0; i < to.length; i++) {
            if (hasMinted[txHashes[i]]) {
                revert AlreadyMinted(to[i], txHashes[i]);
            }

            hasMinted[txHashes[i]] = true;
            _mint(to[i], MINT_AMOUNT);
            
            emit TokensMinted(to[i], MINT_AMOUNT, txHashes[i]);
        }

        _mintCount += to.length;

        // Auto-deploy liquidity when max mint count is reached
        if (_mintCount == MAX_MINT_COUNT) {
            _initializePoolAndDeployLiquidity(10_000, 200);
        }
    }

    /// @notice Mints tokens to a single address
    /// @param to Address to mint tokens to
    /// @param txHash Transaction hash of the USDC payment
    function mint(address to, bytes32 txHash) external onlyRole(MINTER_ROLE) {
        address[] memory recipients = new address[](1);
        bytes32[] memory hashes = new bytes32[](1);
        recipients[0] = to;
        hashes[0] = txHash;
        batchMint(recipients, hashes);
    }

    // ==================== Uniswap v4 Liquidity ====================

    /// @notice Initialize the Uniswap v4 pool and deploy liquidity
    /// @param fee The pool fee in pips (e.g. 3000 = 0.3%)
    /// @param tickSpacing The tick spacing for the pool configuration
    function _initializePoolAndDeployLiquidity(uint24 fee, int24 tickSpacing) internal {
        (address token0, address token1, uint160 sqrtPriceX96) = _sortedTokenData();

        PoolKey memory poolKey = PoolKey({
            currency0: Currency.wrap(token0),
            currency1: Currency.wrap(token1),
            fee: fee,
            tickSpacing: tickSpacing,
            hooks: IHooks(lpGuardHook)
        });

        POOL_MANAGER.initialize(poolKey, sqrtPriceX96);

        bytes memory actions = abi.encodePacked(uint8(Actions.MINT_POSITION), uint8(Actions.SETTLE_PAIR));

        uint256 amountPayment = PAYMENT_SEED;
        // LP tokens already minted in constructor, no need to mint again

        (uint128 amount0Max, uint128 amount1Max, uint128 liquidity) =
            _calculateMintParams(poolKey, amountPayment, POOL_SEED_AMOUNT);

        (int24 tickLower, int24 tickUpper) = _fullRangeTicks(tickSpacing);

        // Set up approvals
        IERC20(PAYMENT_TOKEN).approve(address(PERMIT2), amountPayment);
        IERC20(address(this)).approve(address(PERMIT2), POOL_SEED_AMOUNT);

        PERMIT2.approve(PAYMENT_TOKEN, address(POSITION_MANAGER), SafeCast.toUint160(amountPayment), type(uint48).max);
        PERMIT2.approve(address(this), address(POSITION_MANAGER), SafeCast.toUint160(POOL_SEED_AMOUNT), type(uint48).max);

        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(poolKey, tickLower, tickUpper, liquidity, amount0Max, amount1Max, address(this), bytes(""));
        params[1] = abi.encode(poolKey.currency0, poolKey.currency1);

        uint256 tokenIdBefore = POSITION_MANAGER.nextTokenId();
        POSITION_MANAGER.modifyLiquidities(abi.encode(actions, params), block.timestamp);

        _lpTokenId = tokenIdBefore;
        _liquidityDeployed = true;
        emit LiquidityDeployed(tokenIdBefore, liquidity);
    }

    /// @notice Set the LP guard hook address (can only be called once before liquidity deployment)
    function setLpGuardHook(address _lpGuardHook) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(lpGuardHook == address(0), "Hook already set");
        require(_lpGuardHook != address(0), "Invalid hook address");
        lpGuardHook = _lpGuardHook;
    }

    /// @notice Collect outstanding fees from the protocol-owned LP position
    function collectLpFees() external onlyRole(DEFAULT_ADMIN_ROLE) {
        uint256 tokenId = _lpTokenId;
        require(tokenId != 0, "LP_NOT_INITIALIZED");

        (PositionPoolKey memory poolKey,) = POSITION_MANAGER.getPoolAndPositionInfo(tokenId);

        bytes memory actions = abi.encodePacked(uint8(Actions.DECREASE_LIQUIDITY), uint8(Actions.TAKE_PAIR));

        bytes[] memory params = new bytes[](2);
        params[0] = abi.encode(tokenId, uint256(0), uint128(0), uint128(0), bytes(""));
        params[1] = abi.encode(poolKey.currency0, poolKey.currency1, msg.sender);

        uint256 deadline = block.timestamp + 1 hours;
        POSITION_MANAGER.modifyLiquidities(abi.encode(actions, params), deadline);
    }

    /// @notice Emergency withdraw function to recover funds before liquidity deployment
    function emergencyWithdraw() external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!_liquidityDeployed, "Liquidity already deployed");
        require(!_emergencyWithdrawUsed, "Emergency withdraw already used");

        _emergencyWithdrawUsed = true;

        // Transfer LP seed tokens that were minted in constructor
        uint256 tokenBalance = balanceOf(address(this));
        if (tokenBalance > 0) {
            _transfer(address(this), msg.sender, tokenBalance);
        }

        // Transfer USDC
        uint256 balance = IERC20(PAYMENT_TOKEN).balanceOf(address(this));
        if (balance > 0) {
            IERC20(PAYMENT_TOKEN).transfer(msg.sender, balance);
        }
    }

    /// @notice Withdraw any ERC20 token from the contract to the admin
    function withdrawToken(address token, uint256 amount) external onlyRole(DEFAULT_ADMIN_ROLE) {
        IERC20(token).transfer(msg.sender, amount);
    }

    // ==================== Internal Helpers ====================

    function _validateTimeframe(uint256 validAfter, uint256 validBefore) internal view {
        uint256 nowTs = block.timestamp;
        if (nowTs <= validAfter) revert AuthorizationNotYetValid(nowTs, validAfter);
        if (nowTs >= validBefore) revert AuthorizationExpired(nowTs, validBefore);
    }

    function _useAuthorization(address authorizer, bytes32 nonce) internal {
        if (_authorizationStates[authorizer][nonce] != 0) {
            revert AuthorizationStateInvalid(authorizer, nonce);
        }
        _authorizationStates[authorizer][nonce] = 1; // Used
        emit AuthorizationUsed(authorizer, nonce);
    }

    function _requireValidSignature(
        address expectedSigner,
        bytes32 structHash,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) internal view {
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, v, r, s);
        if (signer != expectedSigner) revert InvalidSigner(signer, expectedSigner);
    }

    function _calculateMintParams(
        PoolKey memory poolKey,
        uint256 amountPaymentToken,
        uint256 amountToken
    ) internal view returns (uint128 amount0Max, uint128 amount1Max, uint128 liquidity) {
        uint256 amount0;
        uint256 amount1;

        if (PAYMENT_TOKEN_IS_TOKEN0) {
            amount0 = amountPaymentToken;
            amount1 = amountToken;
        } else {
            amount0 = amountToken;
            amount1 = amountPaymentToken;
        }

        amount0Max = SafeCast.toUint128(amount0);
        amount1Max = SafeCast.toUint128(amount1);

        uint256 sqrtPriceX96 = PAYMENT_TOKEN_IS_TOKEN0 ? SQRT_PRICE_PAYMENT_TOKEN_FIRST : SQRT_PRICE_TOKEN_FIRST;
        (int24 tickLower, int24 tickUpper) = _fullRangeTicks(poolKey.tickSpacing);

        liquidity = LiquidityAmounts.getLiquidityForAmounts(
            SafeCast.toUint160(sqrtPriceX96),
            TickMath.getSqrtPriceAtTick(tickLower),
            TickMath.getSqrtPriceAtTick(tickUpper),
            amount0,
            amount1
        );
    }

    function _fullRangeTicks(int24 tickSpacing) internal pure returns (int24 tickLower, int24 tickUpper) {
        tickLower = (TickMath.MIN_TICK / tickSpacing) * tickSpacing;
        if (tickLower < TickMath.MIN_TICK) {
            tickLower += tickSpacing;
        }

        tickUpper = (TickMath.MAX_TICK / tickSpacing) * tickSpacing;
        if (tickUpper > TickMath.MAX_TICK) {
            tickUpper -= tickSpacing;
        }
    }

    function _sortedTokenData() internal view returns (address token0, address token1, uint160 sqrtPriceX96) {
        if (PAYMENT_TOKEN_IS_TOKEN0) {
            token0 = PAYMENT_TOKEN;
            token1 = address(this);
            sqrtPriceX96 = SQRT_PRICE_PAYMENT_TOKEN_FIRST;
        } else {
            token0 = address(this);
            token1 = PAYMENT_TOKEN;
            sqrtPriceX96 = SQRT_PRICE_TOKEN_FIRST;
        }
    }

    // ==================== View Functions ====================

    function maxMintCount() public view returns (uint256) {
        return MAX_MINT_COUNT;
    }

    function mintCount() public view returns (uint256) {
        return _mintCount;
    }

    function mintAmount() public view returns (uint256) {
        return MINT_AMOUNT;
    }

    function paymentSeed() public view returns (uint256) {
        return PAYMENT_SEED;
    }

    function liquidityDeployed() public view returns (bool) {
        return _liquidityDeployed;
    }

    function maxSupply() public pure returns (uint256) {
        return MAX_SUPPLY;
    }

    function remainingSupply() public view returns (uint256) {
        return MAX_SUPPLY - totalSupply();
    }
}

