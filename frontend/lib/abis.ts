// ARCANA Protocol — Contract ABIs

export const ARCANA_CRED_ABI = [
  {
    "inputs": [{"name": "proof", "type": "bytes"}, {"name": "instances", "type": "uint256[]"}],
    "name": "mintTier",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "user", "type": "address"}],
    "name": "getTier",
    "outputs": [{"type": "uint8"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "user", "type": "address"}],
    "name": "getCollateralRatio",
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "user", "type": "address"}],
    "name": "isCredentialValid",
    "outputs": [{"type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "user", "type": "address"}],
    "name": "userTier",
    "outputs": [{"type": "uint8"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "user", "type": "address"},
      {"indexed": true, "name": "tokenId", "type": "uint256"},
      {"indexed": false, "name": "tier", "type": "uint8"},
      {"indexed": false, "name": "score", "type": "uint256"},
      {"indexed": false, "name": "expiry", "type": "uint64"}
    ],
    "name": "CredentialMinted",
    "type": "event"
  }
] as const;

export const ARCANA_LEND_ABI = [
  {
    "inputs": [{"name": "amount", "type": "uint256"}],
    "name": "depositLiquidity",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "shares", "type": "uint256"}],
    "name": "withdrawLiquidity",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "borrowAmount", "type": "uint256"}, {"name": "collateralAmount", "type": "uint256"}],
    "name": "borrow",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "repay",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalDeposits",
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalBorrowed",
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "utilizationRate",
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "user", "type": "address"}],
    "name": "getPosition",
    "outputs": [
      {"name": "collateral", "type": "uint256"},
      {"name": "borrowed", "type": "uint256"},
      {"name": "interest", "type": "uint256"},
      {"name": "tier", "type": "uint8"},
      {"name": "ratio", "type": "uint256"},
      {"name": "healthy", "type": "bool"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "lender", "type": "address"}],
    "name": "getLenderValue",
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

export const ARCANA_PLEDGE_ABI = [
  {
    "inputs": [
      {"name": "currentTier", "type": "uint8"},
      {"name": "targetTier", "type": "uint8"},
      {"name": "daysToImprove", "type": "uint16"},
      {"name": "premium", "type": "uint256"}
    ],
    "name": "createPledge",
    "outputs": [{"name": "pledgeId", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "pledgeId", "type": "uint256"}],
    "name": "takePledge",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "pledgeId", "type": "uint256"},
      {"name": "proof", "type": "bytes"},
      {"name": "instances", "type": "uint256[]"}
    ],
    "name": "resolvePledge",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "pledgeId", "type": "uint256"}],
    "name": "claimExpired",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalPledges",
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getOpenPledges",
    "outputs": [{"type": "uint256[]"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "pledgeId", "type": "uint256"}],
    "name": "getPledge",
    "outputs": [{
      "components": [
        {"name": "pledgor", "type": "address"},
        {"name": "counterparty", "type": "address"},
        {"name": "currentTier", "type": "uint8"},
        {"name": "targetTier", "type": "uint8"},
        {"name": "deadline", "type": "uint64"},
        {"name": "premium", "type": "uint256"},
        {"name": "status", "type": "uint8"},
        {"name": "pledgorWon", "type": "bool"}
      ],
      "type": "tuple"
    }],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

export const ERC20_ABI = [
  {
    "inputs": [{"name": "spender", "type": "address"}, {"name": "amount", "type": "uint256"}],
    "name": "approve",
    "outputs": [{"type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "owner", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "owner", "type": "address"}, {"name": "spender", "type": "address"}],
    "name": "allowance",
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
