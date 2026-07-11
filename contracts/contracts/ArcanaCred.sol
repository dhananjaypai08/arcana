// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ArcanaCred
 * @notice ERC-5192 Soulbound credential NFT for ARCANA Protocol.
 *         Each address can hold one credential token that encodes a credit tier
 *         proven via zero-knowledge proof of the ARCANA credit scoring MLP.
 *
 * Tiers:
 *   0 = None  (no credential)
 *   1 = C     (score 500–699,  120% collateral ratio)
 *   2 = B     (score 700–849,  90%  collateral ratio)
 *   3 = A     (score 850+,     70%  collateral ratio)
 */
interface IERC5192 {
    event Locked(uint256 tokenId);
    event Unlocked(uint256 tokenId);
    function locked(uint256 tokenId) external view returns (bool);
}

interface IZKVerifier {
    function verifyProof(
        bytes calldata proof,
        uint256[] calldata instances
    ) external view returns (bool);
}

contract ArcanaCred is ERC721, IERC5192, Ownable {
    // ── State ──────────────────────────────────────────────────────────────

    IZKVerifier public immutable verifier;

    // Minimum public instance values for each tier (scaled to EZKL field representation)
    // These correspond to model outputs: 0.5 → Tier C, 0.7 → Tier B, 0.85 → Tier A
    // EZKL encodes outputs as rational field elements; these constants are set after calibration
    uint256 public tierCThreshold;   // min output for Tier C
    uint256 public tierBThreshold;   // min output for Tier B
    uint256 public tierAThreshold;   // min output for Tier A

    mapping(address => uint8) public userTier;          // 0-3
    mapping(address => uint256) public userTokenId;     // address → token ID
    mapping(uint256 => uint8) public tokenTier;         // tokenId → tier
    mapping(uint256 => uint64) public credentialExpiry; // tokenId → expiry timestamp

    uint256 private _nextTokenId = 1;
    uint64 public constant CREDENTIAL_VALIDITY = 90 days;

    // ── Events ─────────────────────────────────────────────────────────────

    event CredentialMinted(
        address indexed user,
        uint256 indexed tokenId,
        uint8 tier,
        uint256 score,
        uint64 expiry
    );
    event CredentialRevoked(address indexed user, uint256 indexed tokenId);

    // ── Constructor ────────────────────────────────────────────────────────

    constructor(
        address _verifier,
        uint256 _tierCThreshold,
        uint256 _tierBThreshold,
        uint256 _tierAThreshold
    ) ERC721("ARCANA Credential", "ARCRED") Ownable(msg.sender) {
        verifier = IZKVerifier(_verifier);
        tierCThreshold = _tierCThreshold;
        tierBThreshold = _tierBThreshold;
        tierAThreshold = _tierAThreshold;
    }

    // ── Minting ────────────────────────────────────────────────────────────

    /**
     * @notice Mint or upgrade a soulbound credential by submitting a ZK proof.
     * @param proof   EZKL-generated proof bytes
     * @param instances Public outputs from the ZK circuit (score value)
     *
     * The proof asserts: CreditMLP(private_signals) = instances[0]
     * The contract maps instances[0] to a tier and mints the credential.
     */
    function mintTier(
        bytes calldata proof,
        uint256[] calldata instances
    ) external {
        require(instances.length >= 1, "No public output in proof");

        // Verify ZK proof on-chain
        require(
            verifier.verifyProof(proof, instances),
            "ArcanaCred: ZK proof invalid"
        );

        uint256 scoreOutput = instances[0];
        uint8 tier = _computeTier(scoreOutput);
        require(tier > 0, "ArcanaCred: Score too low for any tier");

        // Burn existing credential if present
        uint256 existingId = userTokenId[msg.sender];
        if (existingId != 0 && _ownerOf(existingId) == msg.sender) {
            _burn(existingId);
            emit CredentialRevoked(msg.sender, existingId);
        }

        uint256 tokenId = _nextTokenId++;
        _safeMint(msg.sender, tokenId);

        userTier[msg.sender] = tier;
        userTokenId[msg.sender] = tokenId;
        tokenTier[tokenId] = tier;
        uint64 expiry = uint64(block.timestamp + CREDENTIAL_VALIDITY);
        credentialExpiry[tokenId] = expiry;

        emit Locked(tokenId);
        emit CredentialMinted(msg.sender, tokenId, tier, scoreOutput, expiry);
    }

    // ── Queries ────────────────────────────────────────────────────────────

    function getTier(address user) external view returns (uint8) {
        uint256 tokenId = userTokenId[user];
        if (tokenId == 0) return 0;
        if (block.timestamp > credentialExpiry[tokenId]) return 0; // expired
        return userTier[user];
    }

    function getCollateralRatio(address user) external view returns (uint256) {
        uint8 tier = this.getTier(user);
        if (tier == 3) return 70;
        if (tier == 2) return 90;
        if (tier == 1) return 120;
        return 150; // default: overcollateralized
    }

    function isCredentialValid(address user) external view returns (bool) {
        return this.getTier(user) > 0;
    }

    // ── ERC-5192 Soulbound ─────────────────────────────────────────────────

    function locked(uint256 tokenId) external pure override returns (bool) {
        return true; // always locked — non-transferable
    }

    function _update(
        address to,
        uint256 tokenId,
        address auth
    ) internal override returns (address) {
        address from = _ownerOf(tokenId);
        // Allow minting (from == address(0)) and burning (to == address(0))
        require(
            from == address(0) || to == address(0),
            "ArcanaCred: Soulbound - transfers forbidden"
        );
        return super._update(to, tokenId, auth);
    }

    // ── Admin ──────────────────────────────────────────────────────────────

    function updateThresholds(
        uint256 _tierC,
        uint256 _tierB,
        uint256 _tierA
    ) external onlyOwner {
        tierCThreshold = _tierC;
        tierBThreshold = _tierB;
        tierAThreshold = _tierA;
    }

    function revokeCredential(address user) external onlyOwner {
        uint256 tokenId = userTokenId[user];
        require(tokenId != 0, "No credential to revoke");
        _burn(tokenId);
        userTier[user] = 0;
        userTokenId[user] = 0;
        emit CredentialRevoked(user, tokenId);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        uint8 tier = tokenTier[tokenId];
        string[4] memory tierNames = ["None", "C", "B", "A"];
        string[4] memory colors = ["#888", "#CD7F32", "#C0C0C0", "#FFD700"];
        return string(abi.encodePacked(
            'data:application/json;utf8,{"name":"ARCANA Credential Tier ',
            tierNames[tier],
            '","description":"Zero-knowledge credit credential. Tier ',
            tierNames[tier],
            ' grants reduced collateral requirements in ARCANA Protocol.","attributes":[{"trait_type":"Tier","value":"',
            tierNames[tier],
            '"},{"trait_type":"Collateral Ratio","value":"',
            _collateralStr(tier),
            '"}],"image":"data:image/svg+xml;utf8,',
            _buildSVG(tierNames[tier], colors[tier]),
            '"}'
        ));
    }

    // ── Internal ───────────────────────────────────────────────────────────

    function _computeTier(uint256 scoreOutput) internal view returns (uint8) {
        if (scoreOutput >= tierAThreshold) return 3;
        if (scoreOutput >= tierBThreshold) return 2;
        if (scoreOutput >= tierCThreshold) return 1;
        return 0;
    }

    function _collateralStr(uint8 tier) internal pure returns (string memory) {
        if (tier == 3) return "70%";
        if (tier == 2) return "90%";
        if (tier == 1) return "120%";
        return "150%";
    }

    function _buildSVG(string memory tierName, string memory color) internal pure returns (string memory) {
        return string(abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">',
            '<rect width="200" height="200" rx="16" fill="#0a0a0a"/>',
            '<text x="100" y="80" font-family="monospace" font-size="40" fill="',
            color,
            '" text-anchor="middle">&#9670;</text>',
            '<text x="100" y="120" font-family="monospace" font-size="18" fill="white" text-anchor="middle">ARCANA</text>',
            '<text x="100" y="145" font-family="monospace" font-size="14" fill="',
            color,
            '" text-anchor="middle">TIER ',
            tierName,
            '</text></svg>'
        ));
    }
}
