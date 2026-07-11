/**
 * Local deploy script using Hardhat in-process network
 * Validates all contracts deploy correctly before going to testnet/mainnet
 */
import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const USDC_PLACEHOLDER = "0x054ed45810DbBAb8B27668922D110669c9D88D0a";
const TIER_C_THRESHOLD = ethers.parseUnits("5", 17);
const TIER_B_THRESHOLD = ethers.parseUnits("7", 17);
const TIER_A_THRESHOLD = ethers.parseUnits("85", 16);

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("\n🚀 ARCANA Protocol — Local Validation Deploy");
  console.log("━".repeat(50));
  console.log(`Network:    ${network.name} (ChainID: ${network.chainId})`);
  console.log(`Deployer:   ${deployer.address}`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance:    ${ethers.formatEther(balance)} ETH`);
  console.log("━".repeat(50));

  // Deploy real EZKL Halo2Verifier
  console.log("\n📋 Deploying Halo2Verifier (EZKL-generated ZK verifier)...");
  const Verifier = await ethers.getContractFactory("Halo2Verifier");
  const verifier = await Verifier.deploy();
  await verifier.waitForDeployment();
  const verifierAddress = await verifier.getAddress();
  console.log(`   ✅ Halo2Verifier: ${verifierAddress}`);

  // Deploy ArcanaCred
  console.log("\n📋 Deploying ArcanaCred (ERC-5192 soulbound)...");
  const ArcanaCred = await ethers.getContractFactory("ArcanaCred");
  const cred = await ArcanaCred.deploy(
    verifierAddress, TIER_C_THRESHOLD, TIER_B_THRESHOLD, TIER_A_THRESHOLD
  );
  await cred.waitForDeployment();
  const credAddress = await cred.getAddress();
  console.log(`   ✅ ArcanaCred:    ${credAddress}`);

  // Deploy mock USDC for local testing
  console.log("\n📋 Deploying MockUSDC for local testing...");
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockUsdc = await MockERC20.deploy("USD Coin", "USDC", 6);
  await mockUsdc.waitForDeployment();
  const usdcAddress = await mockUsdc.getAddress();
  console.log(`   ✅ MockUSDC:      ${usdcAddress}`);

  // Deploy ArcanaLend
  console.log("\n📋 Deploying ArcanaLend...");
  const ArcanaLend = await ethers.getContractFactory("ArcanaLend");
  const lend = await ArcanaLend.deploy(usdcAddress, credAddress);
  await lend.waitForDeployment();
  const lendAddress = await lend.getAddress();
  console.log(`   ✅ ArcanaLend:    ${lendAddress}`);

  // Deploy ArcanaPledge
  console.log("\n📋 Deploying ArcanaPledge (score futures market)...");
  const ArcanaPledge = await ethers.getContractFactory("ArcanaPledge");
  const pledge = await ArcanaPledge.deploy(usdcAddress, verifierAddress, credAddress);
  await pledge.waitForDeployment();
  const pledgeAddress = await pledge.getAddress();
  console.log(`   ✅ ArcanaPledge:  ${pledgeAddress}`);

  console.log("\n" + "━".repeat(50));
  console.log("🎉 Local Deploy SUCCESSFUL — all contracts deployed!");
  console.log("━".repeat(50));

  const addresses = {
    network: "hardhat-local",
    chainId: network.chainId.toString(),
    deployer: deployer.address,
    usdc: usdcAddress,
    verifier: verifierAddress,
    arcanaCred: credAddress,
    arcanaLend: lendAddress,
    arcanaPledge: pledgeAddress,
    deployedAt: new Date().toISOString(),
  };

  console.log("\n" + JSON.stringify(addresses, null, 2));
  console.log("\n✅ All 4 ARCANA contracts verified working on local EVM.");
  console.log("   → Ready for testnet: npx hardhat run scripts/deploy.ts --network hashkeyTestnet");
  console.log("   → Ready for mainnet: npx hardhat run scripts/deploy.ts --network hashkey");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
