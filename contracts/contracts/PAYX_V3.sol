// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

/**
 * @title PAYX_V3
 * @notice ERC20 token with x402 payment integration and Uniswap V3 auto-deployment
 */
contract PAYX_V3 is ERC20, ERC20Burnable, AccessControl, EIP712, Ownable {
    // ==================== Errors ====================
    
    error ArrayLengthMismatch();
    error AlreadyMinted(address to, bytes32 txHash);
    error MaxMintCountExceeded();
    error MaxSupplyExceeded();
    error AuthorizationStateInvalid(address authorizer, bytes32 nonce);
    error AuthorizationExpired(uint256 nowTime, uint256 validBefore);
    error AuthorizationNotYetValid(uint256 nowTime, uint256 validAfter);
    error InvalidSigner(address signer, address expected);
    error InvalidRecipient(address to);

    // ==================== Events ====================
    
    event TokensMinted(address indexed to, uint256 amount, bytes32 txHash);
    event LiquidityDeployed(uint256 tokenId, uint128 liquidity);

    // --- EIP-3009 events ---
    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);

    // ==================== Constants ====================

    uint256 public constant MAX_SUPPLY = 2_000_000_000 * 10**18;
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // --- EIP-3009 typehashes ---
    bytes32 private constant _TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 private constant _RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 private constant _CANCEL_AUTHORIZATION_TYPEHASH =
        keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");

    // ==================== Immutable State ====================

    /// @notice Uniswap V3 NonfungiblePositionManager
    address internal immutable POSITION_MANAGER;

    /// @notice The payment token (USDC)
    address internal immutable PAYMENT_TOKEN;

    /// @notice Price per mint in payment token
    uint256 internal immutable PRICE_PER_MINT;

    /// @notice Pool seed amount (tokens for liquidity)
    uint256 internal immutable POOL_SEED_AMOUNT;

    /// @notice Amount of tokens to mint per payment
    uint256 public immutable MINT_AMOUNT;

    /// @notice Maximum number of mints allowed
    uint256 public immutable MAX_MINT_COUNT;

    /// @notice Address to receive excess USDC
    address internal immutable EXCESS_RECIPIENT;

    /// @notice Pool fee tier (500 = 0.05%, 3000 = 0.3%, 10000 = 1%)
    uint24 internal immutable POOL_FEE;

    /// @notice Cached token ordering
    bool internal immutable PAYMENT_TOKEN_IS_TOKEN0;

    // ==================== Mutable State ====================

    uint256 private _mintCount;
    mapping(bytes32 => bool) public hasMinted;
    mapping(address => mapping(bytes32 => uint8)) private _authorizationStates;
    uint256 internal _lpTokenId;
    bool internal _liquidityDeployed;
    bool internal _emergencyWithdrawUsed;

    // ==================== Constructor ====================

    constructor(
        string memory name,
        string memory symbol,
        uint256 _mintAmount,
        uint256 _maxMintCount,
        address _positionManager,
        address _paymentToken,
        uint256 _pricePerMint,
        uint256 _poolSeedAmount,
        address _excessRecipient,
        uint24 _poolFee
    ) ERC20(name, symbol) EIP712(name, "1") Ownable(msg.sender) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        
        MINT_AMOUNT = _mintAmount;
        MAX_MINT_COUNT = _maxMintCount;
        POSITION_MANAGER = _positionManager;
        PAYMENT_TOKEN = _paymentToken;
        PRICE_PER_MINT = _pricePerMint;
        POOL_SEED_AMOUNT = _poolSeedAmount;
        EXCESS_RECIPIENT = _excessRecipient;
        POOL_FEE = _poolFee;

        bool paymentTokenIsToken0 = _paymentToken < address(this);
        PAYMENT_TOKEN_IS_TOKEN0 = paymentTokenIsToken0;

        // Pre-mint LP seed amount to contract
        _mint(address(this), _poolSeedAmount);
    }

    // ==================== EIP-3009 Functions ====================

    function DOMAIN_SEPARATOR() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function authorizationState(address authorizer, bytes32 nonce) external view returns (bool) {
        return _authorizationStates[authorizer][nonce] != 0;
    }

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

    function cancelAuthorization(address authorizer, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external {
        if (_authorizationStates[authorizer][nonce] != 0) {
            revert AuthorizationStateInvalid(authorizer, nonce);
        }
        bytes32 structHash = keccak256(abi.encode(_CANCEL_AUTHORIZATION_TYPEHASH, authorizer, nonce));
        _requireValidSignature(authorizer, structHash, v, r, s);
        _authorizationStates[authorizer][nonce] = 2;
        emit AuthorizationCanceled(authorizer, nonce);
    }

    function _validateTimeframe(uint256 validAfter, uint256 validBefore) internal view {
        if (block.timestamp < validAfter) revert AuthorizationNotYetValid(block.timestamp, validAfter);
        if (block.timestamp > validBefore) revert AuthorizationExpired(block.timestamp, validBefore);
    }

    function _useAuthorization(address authorizer, bytes32 nonce) internal {
        if (_authorizationStates[authorizer][nonce] != 0) {
            revert AuthorizationStateInvalid(authorizer, nonce);
        }
        _authorizationStates[authorizer][nonce] = 1;
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

    // ==================== Minting Logic ====================

    function batchMint(address[] memory to, bytes32[] memory txHashes) public onlyRole(MINTER_ROLE) {
        if (to.length != txHashes.length) {
            revert ArrayLengthMismatch();
        }
        if (_mintCount + to.length > MAX_MINT_COUNT) {
            revert MaxMintCountExceeded();
        }
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
    }

    function mint(address to, bytes32 txHash) external onlyRole(MINTER_ROLE) {
        address[] memory recipients = new address[](1);
        bytes32[] memory hashes = new bytes32[](1);
        recipients[0] = to;
        hashes[0] = txHash;
        batchMint(recipients, hashes);
    }

    // ==================== Uniswap V3 Liquidity ====================

    /// @notice Deploy liquidity to Uniswap V3
    function deployLiquidityV3(
        int24 tickLower,
        int24 tickUpper,
        uint160 sqrtPriceX96
    ) external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256 tokenId, uint128 liquidity) {
        require(_mintCount >= MAX_MINT_COUNT, "Max mint count not reached yet");
        require(!_liquidityDeployed, "Liquidity already deployed");

        // Calculate USDC needed
        uint256 amountPayment = (POOL_SEED_AMOUNT * PRICE_PER_MINT) / MINT_AMOUNT;
        
        // Transfer excess USDC
        uint256 totalBalance = IERC20(PAYMENT_TOKEN).balanceOf(address(this));
        if (totalBalance > amountPayment) {
            uint256 excess = totalBalance - amountPayment;
            IERC20(PAYMENT_TOKEN).transfer(EXCESS_RECIPIENT, excess);
        }

        // Sort tokens
        (address token0, address token1) = PAYMENT_TOKEN < address(this) 
            ? (PAYMENT_TOKEN, address(this))
            : (address(this), PAYMENT_TOKEN);
        
        (uint256 amount0Desired, uint256 amount1Desired) = PAYMENT_TOKEN_IS_TOKEN0
            ? (amountPayment, POOL_SEED_AMOUNT)
            : (POOL_SEED_AMOUNT, amountPayment);

        // Approve position manager
        IERC20(token0).approve(POSITION_MANAGER, amount0Desired);
        IERC20(token1).approve(POSITION_MANAGER, amount1Desired);

        // Mint position
        INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager.MintParams({
            token0: token0,
            token1: token1,
            fee: POOL_FEE,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: amount0Desired,
            amount1Desired: amount1Desired,
            amount0Min: 0,
            amount1Min: 0,
            recipient: address(this),
            deadline: block.timestamp
        });

        (tokenId, liquidity,,) = INonfungiblePositionManager(POSITION_MANAGER).mint(params);

        _lpTokenId = tokenId;
        _liquidityDeployed = true;
        emit LiquidityDeployed(tokenId, liquidity);
    }

    /// @notice Emergency withdraw before LP deployment
    function emergencyWithdraw() external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!_liquidityDeployed, "Liquidity already deployed");
        require(!_emergencyWithdrawUsed, "Emergency withdraw already used");
        _emergencyWithdrawUsed = true;
        
        uint256 balance = IERC20(PAYMENT_TOKEN).balanceOf(address(this));
        if (balance > 0) {
            IERC20(PAYMENT_TOKEN).transfer(msg.sender, balance);
        }
    }

    // ==================== LP Management ====================

    /// @notice Collect accumulated fees from the LP position
    function collectLPFees() external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256 amount0, uint256 amount1) {
        require(_liquidityDeployed, "Liquidity not deployed");
        require(_lpTokenId != 0, "No LP position");

        INonfungiblePositionManager.CollectParams memory params = INonfungiblePositionManager.CollectParams({
            tokenId: _lpTokenId,
            recipient: msg.sender,
            amount0Max: type(uint128).max,
            amount1Max: type(uint128).max
        });

        (amount0, amount1) = INonfungiblePositionManager(POSITION_MANAGER).collect(params);
    }

    /// @notice Decrease liquidity from the LP position (partial or full)
    /// @param liquidity Amount of liquidity to remove (use 0 to check current liquidity)
    /// @param amount0Min Minimum amount of token0 to receive
    /// @param amount1Min Minimum amount of token1 to receive
    function decreaseLiquidity(
        uint128 liquidity,
        uint256 amount0Min,
        uint256 amount1Min
    ) external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256 amount0, uint256 amount1) {
        require(_liquidityDeployed, "Liquidity not deployed");
        require(_lpTokenId != 0, "No LP position");

        INonfungiblePositionManager.DecreaseLiquidityParams memory params = INonfungiblePositionManager.DecreaseLiquidityParams({
            tokenId: _lpTokenId,
            liquidity: liquidity,
            amount0Min: amount0Min,
            amount1Min: amount1Min,
            deadline: block.timestamp
        });

        (amount0, amount1) = INonfungiblePositionManager(POSITION_MANAGER).decreaseLiquidity(params);
    }

    /// @notice Collect tokens after decreasing liquidity
    function collectAfterDecrease() external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256 amount0, uint256 amount1) {
        require(_liquidityDeployed, "Liquidity not deployed");
        require(_lpTokenId != 0, "No LP position");

        INonfungiblePositionManager.CollectParams memory params = INonfungiblePositionManager.CollectParams({
            tokenId: _lpTokenId,
            recipient: msg.sender,
            amount0Max: type(uint128).max,
            amount1Max: type(uint128).max
        });

        (amount0, amount1) = INonfungiblePositionManager(POSITION_MANAGER).collect(params);
    }

    /// @notice Complete LP removal: decrease all liquidity and collect tokens
    /// @param currentLiquidity Current liquidity amount (get from position info)
    function removeLPCompletely(uint128 currentLiquidity) external onlyRole(DEFAULT_ADMIN_ROLE) returns (uint256 amount0, uint256 amount1) {
        require(_liquidityDeployed, "Liquidity not deployed");
        require(_lpTokenId != 0, "No LP position");

        // Step 1: Decrease all liquidity
        INonfungiblePositionManager.DecreaseLiquidityParams memory decreaseParams = INonfungiblePositionManager.DecreaseLiquidityParams({
            tokenId: _lpTokenId,
            liquidity: currentLiquidity,
            amount0Min: 0,
            amount1Min: 0,
            deadline: block.timestamp
        });

        INonfungiblePositionManager(POSITION_MANAGER).decreaseLiquidity(decreaseParams);

        // Step 2: Collect all tokens
        INonfungiblePositionManager.CollectParams memory collectParams = INonfungiblePositionManager.CollectParams({
            tokenId: _lpTokenId,
            recipient: msg.sender,
            amount0Max: type(uint128).max,
            amount1Max: type(uint128).max
        });

        (amount0, amount1) = INonfungiblePositionManager(POSITION_MANAGER).collect(collectParams);

        // Note: NFT still exists but has zero liquidity
        // Can call burnLP() to burn the NFT if desired
    }

    /// @notice Burn the LP NFT (only works when liquidity is zero)
    function burnLP() external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_liquidityDeployed, "Liquidity not deployed");
        require(_lpTokenId != 0, "No LP position");

        INonfungiblePositionManager(POSITION_MANAGER).burn(_lpTokenId);
        _lpTokenId = 0;
    }

    /// @notice Get current LP position information
    function getLPPositionInfo() external view returns (
        uint96 nonce,
        address operator,
        address token0,
        address token1,
        uint24 fee,
        int24 tickLower,
        int24 tickUpper,
        uint128 liquidity,
        uint256 feeGrowthInside0LastX128,
        uint256 feeGrowthInside1LastX128,
        uint128 tokensOwed0,
        uint128 tokensOwed1
    ) {
        require(_lpTokenId != 0, "No LP position");
        return INonfungiblePositionManager(POSITION_MANAGER).positions(_lpTokenId);
    }

    // ==================== View Functions ====================

    function maxMintCount() public view returns (uint256) { return MAX_MINT_COUNT; }
    function mintCount() public view returns (uint256) { return _mintCount; }
    function mintAmount() public view returns (uint256) { return MINT_AMOUNT; }
    function pricePerMint() public view returns (uint256) { return PRICE_PER_MINT; }
    function excessRecipient() public view returns (address) { return EXCESS_RECIPIENT; }
    function liquidityDeployed() public view returns (bool) { return _liquidityDeployed; }
    function maxSupply() public pure returns (uint256) { return MAX_SUPPLY; }
    function lpTokenId() public view returns (uint256) { return _lpTokenId; }
    
    function remainingSupply() public view returns (uint256) {
        uint256 remainingMints = MAX_MINT_COUNT - _mintCount;
        return MINT_AMOUNT * remainingMints;
    }

    function calculateRequiredPayment() public view returns (uint256) {
        return (POOL_SEED_AMOUNT * PRICE_PER_MINT) / MINT_AMOUNT;
    }
}

// Uniswap V3 interface
interface INonfungiblePositionManager {
    struct MintParams {
        address token0;
        address token1;
        uint24 fee;
        int24 tickLower;
        int24 tickUpper;
        uint256 amount0Desired;
        uint256 amount1Desired;
        uint256 amount0Min;
        uint256 amount1Min;
        address recipient;
        uint256 deadline;
    }

    struct DecreaseLiquidityParams {
        uint256 tokenId;
        uint128 liquidity;
        uint256 amount0Min;
        uint256 amount1Min;
        uint256 deadline;
    }

    struct CollectParams {
        uint256 tokenId;
        address recipient;
        uint128 amount0Max;
        uint128 amount1Max;
    }

    function mint(MintParams calldata params)
        external
        payable
        returns (
            uint256 tokenId,
            uint128 liquidity,
            uint256 amount0,
            uint256 amount1
        );
        
    function createAndInitializePoolIfNecessary(
        address token0,
        address token1,
        uint24 fee,
        uint160 sqrtPriceX96
    ) external payable returns (address pool);

    function decreaseLiquidity(DecreaseLiquidityParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1);

    function collect(CollectParams calldata params)
        external
        payable
        returns (uint256 amount0, uint256 amount1);

    function burn(uint256 tokenId) external payable;

    function positions(uint256 tokenId)
        external
        view
        returns (
            uint96 nonce,
            address operator,
            address token0,
            address token1,
            uint24 fee,
            int24 tickLower,
            int24 tickUpper,
            uint128 liquidity,
            uint256 feeGrowthInside0LastX128,
            uint256 feeGrowthInside1LastX128,
            uint128 tokensOwed0,
            uint128 tokensOwed1
        );
}

