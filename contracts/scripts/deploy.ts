import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * ARCANA Protocol Deployment Script
 *
 * Deployment order:
 * 1. ArcanaVerifierStub (or real EZKL verifier if available)
 * 2. ArcanaCred (soulbound NFT, references verifier)
 * 3. ArcanaLend (lending protocol, references cred)
 * 4. ArcanaPledge (futures market, references verifier + cred)
 *
 * USDC on HashKey Chain mainnet: 0x054ed45810DbBAb8B27668922D110669c9D88D0a
 */

// HashKey Chain USDC (mainnet)
const USDC_MAINNET = "0x054ed45810DbBAb8B27668922D110669c9D88D0a";

// EZKL tier thresholds, in the circuit's own fixed-point scale.
// zkml/settings.json → run_args.output_scale = 13, so the circuit encodes a
// float output `x` as round(x * 2^13) = round(x * 8192). The model's final
// activation is a Sigmoid, so raw outputs live in [0, 8192).
// These thresholds are calibrated against that scale (NOT the 0-1000 display
// score the proof server shows off-chain, which is a separate linear
// approximation used only for the UI preview before the real proof runs).
const OUTPUT_SCALE = 8192;
const TIER_C_THRESHOLD = Math.round(0.45 * OUTPUT_SCALE); // ~3686
const TIER_B_THRESHOLD = Math.round(0.55 * OUTPUT_SCALE); // ~4506
const TIER_A_THRESHOLD = Math.round(0.65 * OUTPUT_SCALE); // ~5325

async function main() {
  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();

  console.log("\n🚀 ARCANA Protocol Deployment");
  console.log("━".repeat(50));
  console.log(`Network:    ${network.name} (ChainID: ${network.chainId})`);
  console.log(`Deployer:   ${deployer.address}`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Balance:    ${ethers.formatEther(balance)} ETH/HSK`);
  console.log("━".repeat(50));

  const isMainnet = network.chainId === 177n;
  let usdcAddress: string;

  if (isMainnet) {
    usdcAddress = USDC_MAINNET;
    console.log(`\nUSDC:       ${usdcAddress} (mainnet USDC)`);
  } else {
    // The real mainnet USDC address has no contract code on testnet — using
    // it there makes every safeTransferFrom() call revert. Deploy a mintable
    // mock USDC instead so deposit/borrow/pledge flows actually work.
    console.log("\n📋 Deploying MockERC20 (testnet USDC stand-in)...");
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockUsdc = await MockERC20.deploy("Mock USD Coin", "USDC", 6);
    await mockUsdc.waitForDeployment();
    usdcAddress = await mockUsdc.getAddress();
    console.log(`   ✅ MockERC20 (USDC):    ${usdcAddress}`);
    console.log(`   💰 Minted 1,000,000 USDC to deployer (${deployer.address})`);
    console.log(`      Use mockUsdc.mint(address, amount) to fund other test accounts.`);
  }

  // ── 1. Deploy Verifier ────────────────────────────────────────────────

  // Check if real EZKL verifier exists
  const ezklVerifierPath = path.join(__dirname, "../../zkml/ArcanaVerifier.sol");
  const useRealVerifier = fs.existsSync(ezklVerifierPath) &&
    fs.readFileSync(ezklVerifierPath, "utf8").includes("function verifyProof");

  let verifierAddress: string;

  if (useRealVerifier) {
    console.log("\n📋 Deploying EZKL Halo2 Verifier (real ZK)...");
    // The real verifier compiled from zkml/ArcanaVerifier.sol
    const Verifier = await ethers.getContractFactory("Halo2Verifier");
    const verifier = await Verifier.deploy();
    await verifier.waitForDeployment();
    verifierAddress = await verifier.getAddress();
    console.log(`   ✅ ArcanaVerifier:      ${verifierAddress}`);
  } else {
    console.log("\n📋 Deploying Verifier Stub (demo mode — run ezkl_setup.py for real ZK)...");
    const VerifierStub = await ethers.getContractFactory("ArcanaVerifierStub");
    const stub = await VerifierStub.deploy();
    await stub.waitForDeployment();
    verifierAddress = await stub.getAddress();
    console.log(`   ✅ ArcanaVerifierStub:  ${verifierAddress}`);
  }

  // ── 2. Deploy ArcanaCred ──────────────────────────────────────────────

  console.log("\n📋 Deploying ArcanaCred (ERC-5192 soulbound)...");
  const ArcanaCred = await ethers.getContractFactory("ArcanaCred");
  const cred = await ArcanaCred.deploy(
    verifierAddress,
    TIER_C_THRESHOLD,
    TIER_B_THRESHOLD,
    TIER_A_THRESHOLD
  );
  await cred.waitForDeployment();
  const credAddress = await cred.getAddress();
  console.log(`   ✅ ArcanaCred:           ${credAddress}`);

  // ── 3. Deploy ArcanaLend ──────────────────────────────────────────────

  console.log("\n📋 Deploying ArcanaLend...");
  const ArcanaLend = await ethers.getContractFactory("ArcanaLend");
  const lend = await ArcanaLend.deploy(usdcAddress, credAddress);
  await lend.waitForDeployment();
  const lendAddress = await lend.getAddress();
  console.log(`   ✅ ArcanaLend:           ${lendAddress}`);

  // ── 4. Deploy ArcanaPledge ────────────────────────────────────────────

  console.log("\n📋 Deploying ArcanaPledge (score futures market)...");
  const ArcanaPledge = await ethers.getContractFactory("ArcanaPledge");
  const pledge = await ArcanaPledge.deploy(usdcAddress, verifierAddress, credAddress);
  await pledge.waitForDeployment();
  const pledgeAddress = await pledge.getAddress();
  console.log(`   ✅ ArcanaPledge:         ${pledgeAddress}`);

  // ── Summary ───────────────────────────────────────────────────────────

  console.log("\n" + "━".repeat(50));
  console.log("🎉 Deployment Complete!");
  console.log("━".repeat(50));

  const addresses = {
    network: network.name,
    chainId: network.chainId.toString(),
    deployer: deployer.address,
    usdc: usdcAddress,
    verifier: verifierAddress,
    arcanaCred: credAddress,
    arcanaLend: lendAddress,
    arcanaPledge: pledgeAddress,
    deployedAt: new Date().toISOString(),
    explorerBase: `https://explorer.hsk.xyz/address`,
  };

  console.log("\nContract Addresses:");
  console.log(JSON.stringify(addresses, null, 2));

  // Save to file for frontend + proof server
  const outPath = path.join(__dirname, "../deployments.json");
  fs.writeFileSync(outPath, JSON.stringify(addresses, null, 2));
  console.log(`\n💾 Addresses saved to ${outPath}`);

  console.log("\n🔍 Explorer Links:");
  for (const [key, addr] of Object.entries(addresses)) {
    if (typeof addr === "string" && addr.startsWith("0x") && addr.length === 42) {
      console.log(`   ${key}: https://explorer.hsk.xyz/address/${addr}`);
    }
  }

  console.log("\n📋 Next steps:");
  console.log("   1. Run: python3 zkml/ezkl_setup.py (to generate real ZK verifier)");
  console.log("   2. Copy zkml/ArcanaVerifier.sol → contracts/contracts/");
  console.log("   3. Re-deploy with real verifier: npm run deploy:mainnet");
  console.log("   4. Update proof-server/.env with contract addresses");
  console.log("   5. Update frontend/.env.local with contract addresses");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
