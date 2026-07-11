// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IZKVerifier {
    function verifyProof(bytes calldata proof, uint256[] calldata instances) external view returns (bool);
}

interface IArcanaCred {
    function tierCThreshold() external view returns (uint256);
    function tierBThreshold() external view returns (uint256);
    function tierAThreshold() external view returns (uint256);
}

/**
 * @title ArcanaPledge
 * @notice ARCANA Score Futures Market — bet on improving your own ZK-proven credit tier.
 *
 * This contract implements a novel financial primitive:
 * derivatives on personal ZK-proven attributes.
 *
 * A user (pledgor) creates a pledge: "I will improve my ARCANA tier from X to Y in D days."
 * A counterparty takes the other side. Both deposit equal premiums.
 * At deadline, the pledgor submits a new ZK proof of their score.
 * If target tier is reached → pledgor wins both premiums.
 * If target not reached   → counterparty wins both premiums.
 *
 * Pledge resolution is fully trustless — governed only by ZK proofs.
 */
contract ArcanaPledge is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ── Types ──────────────────────────────────────────────────────────────

    enum PledgeStatus { Open, Matched, Resolved, Expired }

    struct Pledge {
        address pledgor;       // user who made the pledge
        address counterparty;  // who bet against them (0 if unmatched)
        uint8   currentTier;   // tier at time of pledge creation
        uint8   targetTier;    // tier they're pledging to reach
        uint64  deadline;      // unix timestamp
        uint256 premium;       // USDC amount each side deposits
        PledgeStatus status;
        bool    pledgorWon;    // set on resolution
    }

    // ── State ──────────────────────────────────────────────────────────────

    IERC20 public immutable usdc;
    IZKVerifier public immutable verifier;
    IArcanaCred public immutable cred;

    Pledge[] public pledges;
    uint256 public protocolFeeBps = 200; // 2% fee on winnings
    address public feeRecipient;

    // ── Events ─────────────────────────────────────────────────────────────

    event PledgeCreated(
        uint256 indexed pledgeId,
        address indexed pledgor,
        uint8 currentTier,
        uint8 targetTier,
        uint64 deadline,
        uint256 premium
    );
    event PledgeMatched(uint256 indexed pledgeId, address indexed counterparty);
    event PledgeResolved(
        uint256 indexed pledgeId,
        address indexed winner,
        bool pledgorWon,
        uint256 payout
    );
    event PledgeExpired(uint256 indexed pledgeId);

    // ── Constructor ────────────────────────────────────────────────────────

    constructor(address _usdc, address _verifier, address _cred) Ownable(msg.sender) {
        usdc = IERC20(_usdc);
        verifier = IZKVerifier(_verifier);
        cred = IArcanaCred(_cred);
        feeRecipient = msg.sender;
    }

    // ── Pledge Lifecycle ───────────────────────────────────────────────────

    /**
     * @notice Create a new pledge: "I will reach targetTier by deadline."
     * @param currentTier Your current credential tier (1-2, as you're pledging to improve)
     * @param targetTier  The tier you're pledging to achieve (must be > currentTier)
     * @param daysToImprove Number of days to achieve the target
     * @param premium USDC amount to put up (counterparty must match)
     */
    function createPledge(
        uint8  currentTier,
        uint8  targetTier,
        uint16 daysToImprove,
        uint256 premium
    ) external nonReentrant returns (uint256 pledgeId) {
        require(targetTier > currentTier, "Target must exceed current tier");
        require(targetTier <= 3, "Max tier is A (3)");
        require(currentTier <= 2, "Invalid current tier");
        require(daysToImprove >= 1 && daysToImprove <= 365, "Invalid duration");
        require(premium >= 1e6, "Minimum premium: 1 USDC"); // 1 USDC (6 decimals)

        usdc.safeTransferFrom(msg.sender, address(this), premium);

        uint64 deadline = uint64(block.timestamp + uint256(daysToImprove) * 1 days);

        pledgeId = pledges.length;
        pledges.push(Pledge({
            pledgor: msg.sender,
            counterparty: address(0),
            currentTier: currentTier,
            targetTier: targetTier,
            deadline: deadline,
            premium: premium,
            status: PledgeStatus.Open,
            pledgorWon: false
        }));

        emit PledgeCreated(pledgeId, msg.sender, currentTier, targetTier, deadline, premium);
    }

    /**
     * @notice Take the counterparty position on an open pledge.
     */
    function takePledge(uint256 pledgeId) external nonReentrant {
        Pledge storage p = pledges[pledgeId];
        require(p.status == PledgeStatus.Open, "Pledge not open");
        require(p.counterparty == address(0), "Already matched");
        require(msg.sender != p.pledgor, "Cannot bet against yourself");
        require(block.timestamp < p.deadline, "Pledge has expired");

        usdc.safeTransferFrom(msg.sender, address(this), p.premium);
        p.counterparty = msg.sender;
        p.status = PledgeStatus.Matched;

        emit PledgeMatched(pledgeId, msg.sender);
    }

    /**
     * @notice Resolve a matched pledge by submitting a ZK proof of new score.
     *         If the proof demonstrates the target tier is reached → pledgor wins.
     * @param pledgeId  The pledge to resolve
     * @param proof     EZKL ZK proof bytes
     * @param instances Public instances from the ZK circuit
     */
    function resolvePledge(
        uint256 pledgeId,
        bytes calldata proof,
        uint256[] calldata instances
    ) external nonReentrant {
        Pledge storage p = pledges[pledgeId];
        require(p.status == PledgeStatus.Matched, "Pledge not matched");
        require(msg.sender == p.pledgor, "Only pledgor can resolve");
        require(block.timestamp <= p.deadline + 1 days, "Too late to resolve"); // 1 day grace

        // Verify ZK proof
        require(verifier.verifyProof(proof, instances), "ArcanaPledge: Invalid ZK proof");

        uint256 provenScore = instances[0];
        uint8 provenTier = _computeTier(provenScore);
        bool pledgorWon = provenTier >= p.targetTier;

        p.status = PledgeStatus.Resolved;
        p.pledgorWon = pledgorWon;

        uint256 totalPot = p.premium * 2;
        uint256 fee = (totalPot * protocolFeeBps) / 10000;
        uint256 payout = totalPot - fee;

        address winner = pledgorWon ? p.pledgor : p.counterparty;
        usdc.safeTransfer(feeRecipient, fee);
        usdc.safeTransfer(winner, payout);

        emit PledgeResolved(pledgeId, winner, pledgorWon, payout);
    }

    /**
     * @notice Claim refund if a pledge expired without being matched,
     *         or if the pledgor failed to resolve in time.
     */
    function claimExpired(uint256 pledgeId) external nonReentrant {
        Pledge storage p = pledges[pledgeId];

        if (p.status == PledgeStatus.Open && block.timestamp > p.deadline) {
            // Unmatched pledge expired → refund pledgor
            require(msg.sender == p.pledgor, "Only pledgor");
            p.status = PledgeStatus.Expired;
            usdc.safeTransfer(p.pledgor, p.premium);
            emit PledgeExpired(pledgeId);
        } else if (
            p.status == PledgeStatus.Matched &&
            block.timestamp > p.deadline + 1 days
        ) {
            // Pledgor failed to resolve → counterparty wins
            require(
                msg.sender == p.counterparty || msg.sender == owner(),
                "Only counterparty or owner"
            );
            p.status = PledgeStatus.Resolved;
            p.pledgorWon = false;

            uint256 totalPot = p.premium * 2;
            uint256 fee = (totalPot * protocolFeeBps) / 10000;
            uint256 payout = totalPot - fee;
            usdc.safeTransfer(feeRecipient, fee);
            usdc.safeTransfer(p.counterparty, payout);

            emit PledgeResolved(pledgeId, p.counterparty, false, payout);
        } else {
            revert("Cannot claim this pledge");
        }
    }

    // ── Views ──────────────────────────────────────────────────────────────

    function getPledge(uint256 pledgeId) external view returns (Pledge memory) {
        return pledges[pledgeId];
    }

    function totalPledges() external view returns (uint256) {
        return pledges.length;
    }

    function getOpenPledges() external view returns (uint256[] memory ids) {
        uint256 count = 0;
        for (uint256 i = 0; i < pledges.length; i++) {
            if (pledges[i].status == PledgeStatus.Open) count++;
        }
        ids = new uint256[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < pledges.length; i++) {
            if (pledges[i].status == PledgeStatus.Open) ids[j++] = i;
        }
    }

    // ── Internal ───────────────────────────────────────────────────────────

    function _computeTier(uint256 scoreOutput) internal view returns (uint8) {
        if (scoreOutput >= cred.tierAThreshold()) return 3;
        if (scoreOutput >= cred.tierBThreshold()) return 2;
        if (scoreOutput >= cred.tierCThreshold()) return 1;
        return 0;
    }

    // ── Admin ──────────────────────────────────────────────────────────────

    function setFee(uint256 bps) external onlyOwner {
        require(bps <= 1000, "Max 10%");
        protocolFeeBps = bps;
    }

    function setFeeRecipient(address recipient) external onlyOwner {
        feeRecipient = recipient;
    }
}
