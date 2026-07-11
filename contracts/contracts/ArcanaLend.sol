// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IArcanaCred {
    function getCollateralRatio(address user) external view returns (uint256);
    function isCredentialValid(address user) external view returns (bool);
    function getTier(address user) external view returns (uint8);
}

/**
 * @title ArcanaLend
 * @notice Under-collateralized USDC lending powered by ARCANA zkML credentials.
 *
 * Standard DeFi requires 150% collateral. ARCANA Tier A users only need 70%.
 * The collateral ratio is determined by the user's ZK-proven credit credential.
 *
 * Collateral: USDC (or any ERC20)
 * Borrowed: USDC from the shared lending pool
 *
 * Tiers & Ratios:
 *   No credential  → 150% (overcollateralized, standard)
 *   Tier C (500+)  → 120%
 *   Tier B (700+)  →  90%
 *   Tier A (850+)  →  70% (under-collateralized!)
 */
contract ArcanaLend is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── State ──────────────────────────────────────────────────────────────

    IERC20 public immutable usdc;
    IArcanaCred public immutable credential;

    uint256 public totalDeposits;
    uint256 public totalBorrowed;

    // Annual interest rate in basis points (e.g., 500 = 5%)
    uint256 public baseInterestBps = 500;

    struct Position {
        uint256 collateral;    // USDC deposited as collateral
        uint256 borrowed;      // USDC borrowed
        uint256 borrowedAt;    // timestamp of borrow
        uint8   tier;          // credential tier at time of borrow
        uint256 collateralRatio; // ratio at time of borrow (in %)
    }

    mapping(address => Position) public positions;
    mapping(address => uint256) public lenderShares;
    uint256 public totalShares;

    uint256 public constant LIQUIDATION_BUFFER = 110; // liquidate at 110% of required ratio

    // ── Events ─────────────────────────────────────────────────────────────

    event LiquidityDeposited(address indexed lender, uint256 amount, uint256 shares);
    event LiquidityWithdrawn(address indexed lender, uint256 amount, uint256 shares);
    event Borrowed(address indexed user, uint256 collateral, uint256 borrowed, uint8 tier, uint256 ratio);
    event Repaid(address indexed user, uint256 amount, uint256 interest);
    event Liquidated(address indexed user, address indexed liquidator, uint256 collateral, uint256 debt);

    // ── Constructor ────────────────────────────────────────────────────────

    constructor(address _usdc, address _credential) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        credential = IArcanaCred(_credential);
    }

    // ── Lender Functions ───────────────────────────────────────────────────

    /**
     * @notice Deposit USDC into the lending pool and earn interest.
     */
    function depositLiquidity(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");
        usdc.safeTransferFrom(msg.sender, address(this), amount);

        uint256 shares;
        if (totalShares == 0 || totalDeposits == 0) {
            shares = amount;
        } else {
            shares = (amount * totalShares) / totalDeposits;
        }

        lenderShares[msg.sender] += shares;
        totalShares += shares;
        totalDeposits += amount;

        emit LiquidityDeposited(msg.sender, amount, shares);
    }

    /**
     * @notice Withdraw proportional USDC from the lending pool.
     */
    function withdrawLiquidity(uint256 shares) external nonReentrant {
        require(shares > 0 && shares <= lenderShares[msg.sender], "Invalid shares");

        uint256 availableLiquidity = totalDeposits - totalBorrowed;
        uint256 amount = (shares * totalDeposits) / totalShares;
        require(amount <= availableLiquidity, "Insufficient liquidity");

        lenderShares[msg.sender] -= shares;
        totalShares -= shares;
        totalDeposits -= amount;

        usdc.safeTransfer(msg.sender, amount);
        emit LiquidityWithdrawn(msg.sender, amount, shares);
    }

    // ── Borrower Functions ─────────────────────────────────────────────────

    /**
     * @notice Borrow USDC by depositing collateral.
     *         The required collateral ratio depends on your ARCANA credential tier.
     * @param borrowAmount USDC to borrow
     * @param collateralAmount USDC to post as collateral
     */
    function borrow(uint256 borrowAmount, uint256 collateralAmount) external nonReentrant {
        require(positions[msg.sender].borrowed == 0, "Repay existing position first");
        require(borrowAmount > 0, "Borrow amount must be > 0");

        uint256 ratio = credential.getCollateralRatio(msg.sender);
        uint8 tier = credential.getTier(msg.sender);

        // Verify collateral meets the required ratio
        // collateral / borrowed >= ratio / 100
        // collateral * 100 >= borrowed * ratio
        require(
            collateralAmount * 100 >= borrowAmount * ratio,
            "ArcanaLend: Insufficient collateral for your tier"
        );

        uint256 availableLiquidity = totalDeposits - totalBorrowed;
        require(borrowAmount <= availableLiquidity, "Insufficient pool liquidity");

        usdc.safeTransferFrom(msg.sender, address(this), collateralAmount);

        positions[msg.sender] = Position({
            collateral: collateralAmount,
            borrowed: borrowAmount,
            borrowedAt: block.timestamp,
            tier: tier,
            collateralRatio: ratio
        });

        totalBorrowed += borrowAmount;
        usdc.safeTransfer(msg.sender, borrowAmount);

        emit Borrowed(msg.sender, collateralAmount, borrowAmount, tier, ratio);
    }

    /**
     * @notice Repay outstanding loan + accrued interest.
     */
    function repay() external nonReentrant {
        Position storage pos = positions[msg.sender];
        require(pos.borrowed > 0, "No active position");

        uint256 interest = _accrued(pos);
        uint256 totalDue = pos.borrowed + interest;

        usdc.safeTransferFrom(msg.sender, address(this), totalDue);

        totalBorrowed -= pos.borrowed;
        totalDeposits += interest; // interest accrues to pool

        uint256 collateral = pos.collateral;
        delete positions[msg.sender];

        usdc.safeTransfer(msg.sender, collateral);

        emit Repaid(msg.sender, totalDue, interest);
    }

    /**
     * @notice Liquidate an undercollateralized position.
     */
    function liquidate(address user) external nonReentrant {
        Position storage pos = positions[user];
        require(pos.borrowed > 0, "No position to liquidate");

        uint256 interest = _accrued(pos);
        uint256 totalDebt = pos.borrowed + interest;
        uint256 requiredCollateral = (totalDebt * pos.collateralRatio * LIQUIDATION_BUFFER) / (100 * 100);

        require(pos.collateral < requiredCollateral, "Position is healthy");

        uint256 collateral = pos.collateral;
        totalBorrowed -= pos.borrowed;
        delete positions[user];

        // Liquidator repays debt, gets collateral
        usdc.safeTransferFrom(msg.sender, address(this), totalDebt);
        totalDeposits += interest;
        usdc.safeTransfer(msg.sender, collateral);

        emit Liquidated(user, msg.sender, collateral, totalDebt);
    }

    // ── Views ──────────────────────────────────────────────────────────────

    function getPosition(address user) external view returns (
        uint256 collateral,
        uint256 borrowed,
        uint256 interest,
        uint8 tier,
        uint256 ratio,
        bool healthy
    ) {
        Position storage pos = positions[user];
        uint256 acc = _accrued(pos);
        uint256 totalDebt = pos.borrowed + acc;
        uint256 requiredCollateral = totalDebt == 0 ? 0 :
            (totalDebt * pos.collateralRatio * LIQUIDATION_BUFFER) / (100 * 100);

        return (
            pos.collateral,
            pos.borrowed,
            acc,
            pos.tier,
            pos.collateralRatio,
            pos.collateral >= requiredCollateral
        );
    }

    function getLenderValue(address lender) external view returns (uint256) {
        if (totalShares == 0) return 0;
        return (lenderShares[lender] * totalDeposits) / totalShares;
    }

    function utilizationRate() external view returns (uint256) {
        if (totalDeposits == 0) return 0;
        return (totalBorrowed * 100) / totalDeposits;
    }

    // ── Internal ───────────────────────────────────────────────────────────

    function _accrued(Position storage pos) internal view returns (uint256) {
        if (pos.borrowed == 0) return 0;
        uint256 elapsed = block.timestamp - pos.borrowedAt;
        return (pos.borrowed * baseInterestBps * elapsed) / (10000 * 365 days);
    }

    // ── Admin ──────────────────────────────────────────────────────────────

    function setInterestRate(uint256 bps) external onlyOwner {
        require(bps <= 5000, "Max 50% APR");
        baseInterestBps = bps;
    }
}
