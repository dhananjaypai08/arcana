import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || "0x" + "0".repeat(64);
const HASHKEY_RPC = process.env.HASHKEY_RPC || "https://mainnet.hsk.xyz";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        // For EZKL verifier — no viaIR (assembly uses deep stack)
        version: "0.8.28",
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "cancun",
        },
      },
    ],
    overrides: {
      // ArcanaCred, ArcanaLend, ArcanaPledge benefit from viaIR for complex logic
      "contracts/ArcanaCred.sol": {
        version: "0.8.28",
        settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun", viaIR: true },
      },
      "contracts/ArcanaLend.sol": {
        version: "0.8.28",
        settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun", viaIR: true },
      },
      "contracts/ArcanaPledge.sol": {
        version: "0.8.28",
        settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun", viaIR: true },
      },
    },
  },
  networks: {
    // HashKey Chain Mainnet
    hashkey: {
      url: HASHKEY_RPC,
      chainId: 177,
      accounts: [PRIVATE_KEY],
      gasPrice: "auto",
    },
    // HashKey Chain Testnet
    hashkeyTestnet: {
      url: "https://testnet.hsk.xyz",
      chainId: 133,
      accounts: [PRIVATE_KEY],
      gasPrice: "auto",
    },
    // Local testing
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
  },
  etherscan: {
    apiKey: {
      hashkey: process.env.ETHERSCAN_API_KEY || "placeholder",
    },
    customChains: [
      {
        network: "hashkey",
        chainId: 177,
        urls: {
          apiURL: "https://explorer.hsk.xyz/api",
          browserURL: "https://explorer.hsk.xyz",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
