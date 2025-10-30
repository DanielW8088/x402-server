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
 * @notice ERC20 token with EIP-3009 (gasless transfers), access control, automated liquidity,
 *         pre-LP transfer gating, and pre-LP refund-on-send-to-contract.
 */
contract X402Token is ERC20, ERC20Burnable, AccessControl, EIP712, Ownable {
    using SafeERC20 for IERC20;

    // ==================== Errors ====================

    error ArrayLengthMismatch();
    error AlreadyMinted(address to, bytes32 txHash);
    error MaxMintCountExceeded();
    error AuthorizationStateInvalid(address authorizer, bytes32 nonce);
    error AuthorizationExpired(uint256 nowTime, uint256 validBefore);
    error AuthorizationNotYetValid(uint256 nowTime, uint256 validAfter);
    error InvalidSigner(address signer, address expected);
    error InvalidRecipient(address to);
    error InvalidAddress();
    error InvalidAmount();
    error EmergencyModeActive();
    error TransfersLocked();
    error InsufficientUSDC(uint256 need, uint256 have);
    error NotLpDeployer();

    // ==================== Events ====================

    event TokensMinted(address indexed to, uint256 amount, bytes32 txHash);
    event AssetsTransferredForLP(address indexed lpDeployer, uint256 tokenAmount, uint256 usdcAmount);
    event EmergencyWithdraw(address indexed recipient, uint256 amount);
    event TokenWithdraw(address indexed token, address indexed recipient, uint256 amount);

    // EIP-3009 events
    event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce);
    event AuthorizationCanceled(address indexed authorizer, bytes32 indexed nonce);

    // New events
    event RefundProcessed(address indexed user, uint256 tokenAmount, uint256 refundUSDC, uint256 feeUSDC);
    event LpStatusChanged(bool live);
    event MintingCompleted(uint256 totalMinted);

    // ==================== Constants ====================

    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // EIP-3009 typehashes
    bytes32 private constant _TRANSFER_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 private constant _RECEIVE_WITH_AUTHORIZATION_TYPEHASH = keccak256(
        "ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)"
    );
    bytes32 private constant _CANCEL_AUTHORIZATION_TYPEHASH =
        keccak256("CancelAuthorization(address authorizer,bytes32 nonce)");

    // ==================== Immutable State ====================

    /// @notice The payment token (e.g., USDC)
    address internal immutable PAYMENT_TOKEN;

    /// @notice Price per mint in payment token
    uint256 internal immutable PRICE_PER_MINT;

    /// @notice Pool seed amount (tokens earmarked for LP)
    uint256 internal immutable POOL_SEED_AMOUNT;

    /// @notice Amount of tokens to mint per payment
    uint256 public immutable MINT_AMOUNT;

    /// @notice Maximum number of mints allowed
    uint256 public immutable MAX_MINT_COUNT;

    /// @notice Address to receive excess funds and refund fees
    address internal immutable EXCESS_RECIPIENT;

    /// @notice Address that will deploy the LP
    address public immutable LP_DEPLOYER;

    // ==================== Mutable State ====================

    uint256 private _mintCount;
    mapping(bytes32 => bool) public hasMinted;
    mapping(address => mapping(bytes32 => uint8)) private _authorizationStates;
    bool internal _assetsTransferred;
    bool internal _emergencyWithdrawUsed;

    /// @notice LP live flag. False before LP is confirmed live; true after LP deployer confirms.
    bool public lpLive;

    /// @notice Minting completed flag. True when all mints are done, waiting for LP deployment.
    bool public mintingCompleted;

    /// @notice LaunchTool contract address (allowed to transfer tokens before LP is live)
    address public launchTool;

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
        if (_paymentToken == address(0)) revert InvalidAddress();
        if (_excessRecipient == address(0)) revert InvalidAddress();
        if (_lpDeployer == address(0)) revert InvalidAddress();

        if (_mintAmount == 0) revert InvalidAmount();
        if (_maxMintCount == 0) revert InvalidAmount();
        if (_pricePerMint == 0) revert InvalidAmount();
        if (_poolSeedAmount == 0) revert InvalidAmount();

        unchecked {
            uint256 totalUserMintable = _mintAmount * _maxMintCount;
            if (_maxMintCount > 0 && totalUserMintable / _maxMintCount != _mintAmount) revert InvalidAmount();
            if (_poolSeedAmount + totalUserMintable < _poolSeedAmount) revert InvalidAmount();
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

        // Pre-mint LP seed amount to the contract
        _mint(address(this), _poolSeedAmount);

        // LP is not live at deployment; deployer must confirm after LP is successfully deployed
        lpLive = false;
        mintingCompleted = false;
        emit LpStatusChanged(false);
    }

    // ==================== Token Overrides ====================

    /**
     * @notice Override decimals to use 6 (same as USDC) instead of default 18
     * @dev This helps avoid precision issues when creating Uniswap V3 pools
     */
    function decimals() public pure override returns (uint8) {
        return 6;
    }

    // ==================== Modifiers / LP Confirmation ====================

    /// @notice Must be called by LP_DEPLOYER to confirm that LP is live.
    function confirmLpLive() external {
        if (msg.sender != LP_DEPLOYER) revert NotLpDeployer();
        require(!_emergencyWithdrawUsed, "Emergency mode");
        require(_assetsTransferred, "Assets not transferred");
        require(!lpLive, "LP already live");

        lpLive = true;
        emit LpStatusChanged(true);
    }

    /// @notice Set LaunchTool address (only owner, only before LP is live)
    function setLaunchTool(address _launchTool) external onlyOwner {
        require(!lpLive, "LP already live");
        require(_launchTool != address(0), "Invalid address");
        launchTool = _launchTool;
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
                from, to, value, validAfter, validBefore, nonce
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
                from, to, value, validAfter, validBefore, nonce
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
        bytes32 structHash = keccak256(abi.encode(_CANCEL_AUTHORIZATION_TYPEHASH, authorizer, nonce));
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

        for (uint256 i = 0; i < to.length; i++) {
            if (hasMinted[txHashes[i]]) {
                revert AlreadyMinted(to[i], txHashes[i]);
            }
            hasMinted[txHashes[i]] = true;
            _mint(to[i], MINT_AMOUNT);
            emit TokensMinted(to[i], MINT_AMOUNT, txHashes[i]);
        }
        _mintCount += to.length;

        // Check if minting is now completed
        if (_mintCount >= MAX_MINT_COUNT && !mintingCompleted) {
            mintingCompleted = true;
            emit MintingCompleted(_mintCount);
        }
    }

    function mint(address to, bytes32 txHash) external onlyRole(MINTER_ROLE) {
        address[] memory recipients = new address[](1);
        bytes32[] memory hashes = new bytes32[](1);
        recipients[0] = to;
        hashes[0] = txHash;
        batchMint(recipients, hashes);
    }

    // ==================== LP Asset Transfer ====================

    /// @notice Transfers tokens and payment token to LP deployer after all mints complete.
    /// @dev Can only be called once, when maxMintCount is reached and emergency not engaged.
    /// @dev Does NOT set lpLive; LP_DEPLOYER must call confirmLpLive() after LP deployment succeeds.
    function transferAssetsForLP() external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_mintCount >= MAX_MINT_COUNT, "Max mint count not reached yet");
        require(!_assetsTransferred, "Assets already transferred");
        if (_emergencyWithdrawUsed) revert EmergencyModeActive();

        _assetsTransferred = true;

        // Payment amount needed for LP alongside seed tokens
        uint256 amountPayment = (POOL_SEED_AMOUNT * PRICE_PER_MINT) / MINT_AMOUNT;

        // Send excess payment token to EXCESS_RECIPIENT
        uint256 totalBalance = IERC20(PAYMENT_TOKEN).balanceOf(address(this));
        if (totalBalance > amountPayment) {
            uint256 excess = totalBalance - amountPayment;
            IERC20(PAYMENT_TOKEN).safeTransfer(EXCESS_RECIPIENT, excess);
        }

        // Transfer seed tokens to LP deployer
        _transfer(address(this), LP_DEPLOYER, POOL_SEED_AMOUNT);

        // Transfer payment token to LP deployer
        IERC20(PAYMENT_TOKEN).safeTransfer(LP_DEPLOYER, amountPayment);

        emit AssetsTransferredForLP(LP_DEPLOYER, POOL_SEED_AMOUNT, amountPayment);
    }

    /// @notice Emergency withdraw of payment token before assets are transferred to LP.
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

    /// @notice Withdraw any ERC20 token held by this contract.
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

    /// @notice Withdraw payment token (convenience wrapper).
    function withdrawUSDC(uint256 amount, address recipient) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address to = recipient == address(0) ? msg.sender : recipient;
        uint256 balance = IERC20(PAYMENT_TOKEN).balanceOf(address(this));
        uint256 withdrawAmount = amount == 0 ? balance : amount;

        if (withdrawAmount == 0) revert InvalidAmount();
        require(balance >= withdrawAmount, "Insufficient balance");

        IERC20(PAYMENT_TOKEN).safeTransfer(to, withdrawAmount);
        emit TokenWithdraw(PAYMENT_TOKEN, to, withdrawAmount);
    }

    /// @notice Get ERC20 token balance held by this contract.
    function getTokenBalance(address token) external view returns (uint256) {
        address tokenToCheck = token == address(0) ? PAYMENT_TOKEN : token;
        return IERC20(tokenToCheck).balanceOf(address(this));
    }

    /// @notice Get payment token balance held by this contract.
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

    // Backward-compatibility getters
    function mintAmount() external view returns (uint256) {
        return MINT_AMOUNT;
    }

    function maxSupply() external view returns (uint256) {
        return (MINT_AMOUNT * MAX_MINT_COUNT) + POOL_SEED_AMOUNT;
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
        uint256 remainingMints = MAX_MINT_COUNT > _mintCount ? MAX_MINT_COUNT - _mintCount : 0;
        return remainingMints * MINT_AMOUNT;
    }

    function poolSeedAmount() external view returns (uint256) {
        return POOL_SEED_AMOUNT;
    }

    function excessRecipient() external view returns (address) {
        return EXCESS_RECIPIENT;
    }

    // ==================== Transfer Gate & Refund-on-Send ====================

    /**
     * @dev Override of ERC20._update (OpenZeppelin v5).
     *
     * Pre-LP rules (lpLive == false):
     * - Only owner() and LP_DEPLOYER may transfer freely (besides mint/burn or contract-internal moves).
     * - Any user may transfer tokens to address(this) to receive a refund in payment token:
     *     * refundBase = (value * PRICE_PER_MINT) / MINT_AMOUNT
     *     * 95% refunded to the sender, 5% sent to EXCESS_RECIPIENT as fee.
     *     * ONLY allowed if mintingCompleted == false (minting still ongoing).
     *     * Once mintingCompleted == true, refunds are blocked (waiting for LP deployment).
     *   The received tokens are immediately burned.
     *
     * Post-LP rules (lpLive == true):
     * - Normal ERC20 transfers (except sending to contract address, which is blocked to prevent loss).
     */
    function _update(address from, address to, uint256 value) internal override {
        bool isMint = (from == address(0));
        bool isBurn = (to == address(0));
        bool fromIsContract = (from == address(this));
        bool toIsContract = (to == address(this));

        if (!lpLive) {
            bool fromIsOwnerOrLP = (from == owner() || from == LP_DEPLOYER);
            bool fromIsLaunchTool = (from == launchTool && launchTool != address(0));

            // Refund path: user sends tokens to this contract before LP is live AND minting not completed
            if (toIsContract && !isMint && !isBurn && !fromIsContract && !mintingCompleted) {
                // 1) Compute refund parameters (must be exact multiple of MINT_AMOUNT)
                if (value % MINT_AMOUNT != 0) revert InvalidAmount();
                uint256 mintsToRefund = value / MINT_AMOUNT;
                
                // 2) Move tokens into the contract
                super._update(from, to, value);
                // 3) Burn them to avoid recycling
                _burn(address(this), value);

                // 4) Decrease mint count to allow re-minting
                _mintCount -= mintsToRefund;
                
                // 5) If minting was completed, revert that status
                if (mintingCompleted) {
                    mintingCompleted = false;
                }

                // 6) Compute refund and fee in payment token
                uint256 refundBase = (value * PRICE_PER_MINT) / MINT_AMOUNT;
                if (refundBase == 0) revert InvalidAmount();

                uint256 refundToUser = (refundBase * 95) / 100;
                uint256 feeToTreasury = refundBase - refundToUser;

                uint256 usdcBal = IERC20(PAYMENT_TOKEN).balanceOf(address(this));
                if (usdcBal < refundBase) revert InsufficientUSDC(refundBase, usdcBal);

                // 7) Transfer payment token: 95% to user, 5% to EXCESS_RECIPIENT
                IERC20(PAYMENT_TOKEN).safeTransfer(from, refundToUser);
                if (feeToTreasury > 0) {
                    IERC20(PAYMENT_TOKEN).safeTransfer(EXCESS_RECIPIENT, feeToTreasury);
                }

                emit RefundProcessed(from, value, refundToUser, feeToTreasury);
                return;
            }

            // Block transfers to contract if minting is completed (waiting for LP)
            // Exception: LP_DEPLOYER, owner, and LaunchTool can still transfer to contracts
            if (toIsContract && !isMint && !isBurn && !fromIsContract && mintingCompleted && !fromIsOwnerOrLP && !fromIsLaunchTool) {
                revert TransfersLocked();
            }

            // Otherwise, only allow owner/LP deployer/LaunchTool (plus mint/burn/contract-internal) to move tokens
            if (
                !isMint &&
                !isBurn &&
                !fromIsContract &&
                !(fromIsOwnerOrLP || fromIsLaunchTool)
            ) {
                revert TransfersLocked();
            }
        } else {
            // LP is live: block transfers to contract to prevent accidental loss
            // (refunds are no longer available)
            if (toIsContract && !isMint && !isBurn && !fromIsContract) {
                revert TransfersLocked();
            }
        }

        // Default behavior (post-LP or allowed cases pre-LP)
        super._update(from, to, value);
    }
}
