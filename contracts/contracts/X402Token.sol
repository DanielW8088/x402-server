// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Burnable} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title X402Token - 0x402 Token with Gasless Minting
 * @notice ERC20 token with EIP-3009 (gasless transfers), access control, and automated liquidity
 * 
 * Features:
 * - Gasless minting via EIP-3009 transferWithAuthorization
 * - 80/20 tokenomics: 80% user mints, 20% LP reserve
 * - After all mints complete, tokens and USDC are transferred to LP deployer address
 * - LP deployment handled by backend service
 * - Automated role management for secure operations
 */
contract X402Token is ERC20, ERC20Burnable, AccessControl, EIP712, Ownable {
    using SafeERC20 for IERC20;
    
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
    error InvalidAddress();
    error InvalidAmount();
    error EmergencyModeActive();

    // ==================== Events ====================
    
    event TokensMinted(address indexed to, uint256 amount, bytes32 txHash);
    event AssetsTransferredForLP(address indexed lpDeployer, uint256 tokenAmount, uint256 usdcAmount);
    event EmergencyWithdraw(address indexed recipient, uint256 amount);
    event TokenWithdraw(address indexed token, address indexed recipient, uint256 amount);

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

    /// @notice Address that will deploy LP (receives tokens and USDC)
    address public immutable LP_DEPLOYER;

    // ==================== Mutable State ====================

    uint256 private _mintCount;
    mapping(bytes32 => bool) public hasMinted;
    mapping(address => mapping(bytes32 => uint8)) private _authorizationStates;
    bool internal _assetsTransferred;
    bool internal _emergencyWithdrawUsed;

    // ==================== Constructor ====================

    constructor(
        string memory name,
        string memory symbol,
        uint256 _mintAmount,
        uint256 _maxMintCount,
        address _paymentToken,
        uint256 _pricePerMint,
        uint256 _poolSeedAmount,
        address _excessRecipient,
        address _lpDeployer
    ) ERC20(name, symbol) EIP712(name, "1") Ownable(msg.sender) {
        // Validate addresses
        if (_paymentToken == address(0)) revert InvalidAddress();
        if (_excessRecipient == address(0)) revert InvalidAddress();
        if (_lpDeployer == address(0)) revert InvalidAddress();
        
        // Validate amounts
        if (_mintAmount == 0) revert InvalidAmount();
        if (_maxMintCount == 0) revert InvalidAmount();
        if (_pricePerMint == 0) revert InvalidAmount();
        if (_poolSeedAmount == 0) revert InvalidAmount();
        
        // Validate supply constraints
        // Ensure pool seed doesn't exceed max supply
        if (_poolSeedAmount > MAX_SUPPLY) revert MaxSupplyExceeded();
        
        // Ensure total supply (pool + user mints) doesn't exceed max supply
        // Note: Using unchecked math here is safe because we check overflow explicitly
        unchecked {
            uint256 totalUserMintable = _mintAmount * _maxMintCount;
            // Check for overflow in multiplication
            if (_maxMintCount > 0 && totalUserMintable / _maxMintCount != _mintAmount) {
                revert MaxSupplyExceeded();
            }
            // Check total supply constraint
            if (_poolSeedAmount + totalUserMintable > MAX_SUPPLY) {
                revert MaxSupplyExceeded();
            }
        }
        
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
        
        MINT_AMOUNT = _mintAmount;
        MAX_MINT_COUNT = _maxMintCount;
        PAYMENT_TOKEN = _paymentToken;
        PRICE_PER_MINT = _pricePerMint;
        POOL_SEED_AMOUNT = _poolSeedAmount;
        EXCESS_RECIPIENT = _excessRecipient;
        LP_DEPLOYER = _lpDeployer;

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
    ) external {
        if (to == address(0)) revert InvalidRecipient(to);
        _requireValidAuthorization(from, nonce, validAfter, validBefore);
        
        bytes32 structHash = keccak256(
            abi.encode(
                _TRANSFER_WITH_AUTHORIZATION_TYPEHASH,
                from,
                to,
                value,
                validAfter,
                validBefore,
                nonce
            )
        );
        _requireValidSignature(from, structHash, v, r, s);
        _markAuthorizationAsUsed(from, nonce);
        _transfer(from, to, value);
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
    ) external {
        if (to != msg.sender) revert InvalidRecipient(to);
        _requireValidAuthorization(from, nonce, validAfter, validBefore);
        
        bytes32 structHash = keccak256(
            abi.encode(
                _RECEIVE_WITH_AUTHORIZATION_TYPEHASH,
                from,
                to,
                value,
                validAfter,
                validBefore,
                nonce
            )
        );
        _requireValidSignature(from, structHash, v, r, s);
        _markAuthorizationAsUsed(from, nonce);
        _transfer(from, to, value);
    }

    function cancelAuthorization(
        address authorizer,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        _requireValidAuthorization(authorizer, nonce, 0, type(uint256).max);
        
        bytes32 structHash = keccak256(
            abi.encode(_CANCEL_AUTHORIZATION_TYPEHASH, authorizer, nonce)
        );
        _requireValidSignature(authorizer, structHash, v, r, s);
        _authorizationStates[authorizer][nonce] = 1;
        emit AuthorizationCanceled(authorizer, nonce);
    }

    function _requireValidAuthorization(
        address authorizer,
        bytes32 nonce,
        uint256 validAfter,
        uint256 validBefore
    ) internal view {
        if (_authorizationStates[authorizer][nonce] != 0) {
            revert AuthorizationStateInvalid(authorizer, nonce);
        }
        if (block.timestamp < validAfter) {
            revert AuthorizationNotYetValid(block.timestamp, validAfter);
        }
        if (block.timestamp > validBefore) {
            revert AuthorizationExpired(block.timestamp, validBefore);
        }
    }

    function _markAuthorizationAsUsed(address authorizer, bytes32 nonce) internal {
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

    // ==================== LP Asset Transfer ====================

    /// @notice Transfer tokens and USDC to LP deployer after all mints complete
    /// @dev Can only be called once, when maxMintCount is reached
    /// @dev Cannot be called if emergency withdraw has been used
    function transferAssetsForLP() external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_mintCount >= MAX_MINT_COUNT, "Max mint count not reached yet");
        require(!_assetsTransferred, "Assets already transferred");
        if (_emergencyWithdrawUsed) revert EmergencyModeActive();

        _assetsTransferred = true;

        // Calculate USDC needed for LP
        // Note: This calculation may have rounding (truncation toward zero)
        // Pool economics should account for this potential 1-wei difference
        uint256 amountPayment = (POOL_SEED_AMOUNT * PRICE_PER_MINT) / MINT_AMOUNT;
        
        // Transfer excess USDC to recipient using SafeERC20
        uint256 totalBalance = IERC20(PAYMENT_TOKEN).balanceOf(address(this));
        if (totalBalance > amountPayment) {
            uint256 excess = totalBalance - amountPayment;
            IERC20(PAYMENT_TOKEN).safeTransfer(EXCESS_RECIPIENT, excess);
        }

        // Transfer tokens to LP deployer
        _transfer(address(this), LP_DEPLOYER, POOL_SEED_AMOUNT);
        
        // Transfer USDC to LP deployer using SafeERC20
        IERC20(PAYMENT_TOKEN).safeTransfer(LP_DEPLOYER, amountPayment);

        emit AssetsTransferredForLP(LP_DEPLOYER, POOL_SEED_AMOUNT, amountPayment);
    }

    /// @notice Emergency withdraw before assets are transferred
    /// @dev Once used, LP asset transfer will be permanently blocked
    function emergencyWithdraw() external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(!_assetsTransferred, "Assets already transferred");
        require(!_emergencyWithdrawUsed, "Emergency withdraw already used");
        _emergencyWithdrawUsed = true;
        
        uint256 balance = IERC20(PAYMENT_TOKEN).balanceOf(address(this));
        if (balance > 0) {
            IERC20(PAYMENT_TOKEN).safeTransfer(msg.sender, balance);
            emit EmergencyWithdraw(msg.sender, balance);
        }
    }

    /// @notice Withdraw any ERC20 token from the contract
    /// @param token ERC20 token address to withdraw
    /// @param amount Amount to withdraw (0 = withdraw all)
    /// @param recipient Address to receive tokens (address(0) = msg.sender)
    function withdrawERC20(address token, uint256 amount, address recipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (token == address(0)) revert InvalidAddress();
        address to = recipient == address(0) ? msg.sender : recipient;
        uint256 balance = IERC20(token).balanceOf(address(this));
        uint256 withdrawAmount = amount == 0 ? balance : amount;
        
        if (withdrawAmount == 0) revert InvalidAmount();
        require(balance >= withdrawAmount, "Insufficient balance");
        
        IERC20(token).safeTransfer(to, withdrawAmount);
        emit TokenWithdraw(token, to, withdrawAmount);
    }

    /// @notice Withdraw USDC (convenience function)
    function withdrawUSDC(uint256 amount, address recipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address to = recipient == address(0) ? msg.sender : recipient;
        uint256 balance = IERC20(PAYMENT_TOKEN).balanceOf(address(this));
        uint256 withdrawAmount = amount == 0 ? balance : amount;
        
        if (withdrawAmount == 0) revert InvalidAmount();
        require(balance >= withdrawAmount, "Insufficient balance");
        
        IERC20(PAYMENT_TOKEN).safeTransfer(to, withdrawAmount);
        emit TokenWithdraw(PAYMENT_TOKEN, to, withdrawAmount);
    }

    /// @notice Check ERC20 token balance in contract
    function getTokenBalance(address token) external view returns (uint256) {
        address tokenToCheck = token == address(0) ? PAYMENT_TOKEN : token;
        return IERC20(tokenToCheck).balanceOf(address(this));
    }

    /// @notice Check USDC balance in contract
    function getUSDCBalance() external view returns (uint256) {
        return IERC20(PAYMENT_TOKEN).balanceOf(address(this));
    }

    // ==================== View Functions ====================

    function mintCount() external view returns (uint256) {
        return _mintCount;
    }

    function maxMintCount() external view returns (uint256) {
        return MAX_MINT_COUNT;
    }

    function assetsTransferred() external view returns (bool) {
        return _assetsTransferred;
    }

    // ==================== Compatibility Functions ====================
    // For backward compatibility with frontend/tooling expecting old function names

    function mintAmount() external view returns (uint256) {
        return MINT_AMOUNT;
    }

    function maxSupply() external view returns (uint256) {
        return MAX_SUPPLY;
    }

    function liquidityDeployed() external view returns (bool) {
        return _assetsTransferred;
    }

    function pricePerMint() external view returns (uint256) {
        return PRICE_PER_MINT;
    }

    function paymentToken() external view returns (address) {
        return PAYMENT_TOKEN;
    }

    function lpDeployer() external view returns (address) {
        return LP_DEPLOYER;
    }

    function remainingSupply() external view returns (uint256) {
        // Remaining mintable supply = (maxMintCount - mintCount) * mintAmount
        uint256 remainingMints = MAX_MINT_COUNT > _mintCount ? MAX_MINT_COUNT - _mintCount : 0;
        return remainingMints * MINT_AMOUNT;
    }

    function poolSeedAmount() external view returns (uint256) {
        return POOL_SEED_AMOUNT;
    }

    function excessRecipient() external view returns (address) {
        return EXCESS_RECIPIENT;
    }
}

