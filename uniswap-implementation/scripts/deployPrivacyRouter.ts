import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploy PrivacyRouter on Coston2.
 * TEE signer = PRIVATE_KEY wallet (same key used by /api/privacy to attest settlements).
 *
 * Usage:
 *   cd uniswap-implementation
 *   PRIVATE_KEY=0x... npx hardhat run scripts/deployPrivacyRouter.ts --network coston2
 */
async function main() {
  const manager =
    process.env.MANAGER_ADDRESS || "0x90Dfd581393104EAe03Fd349b4867A7E8F51313b";

  const [deployer] = await ethers.getSigners();
  const teeSigner = process.env.TEE_SIGNER_ADDRESS || deployer.address;

  console.log("Deployer:", deployer.address);
  console.log("Manager:", manager);
  console.log("TEE signer:", teeSigner);

  const Factory = await ethers.getContractFactory("PrivacyRouter");
  const router = await Factory.deploy(manager, teeSigner);
  await router.waitForDeployment();
  const address = await router.getAddress();
  console.log("PrivacyRouter:", address);

  const out = {
    privacyRouter: address,
    manager,
    teeSigner,
    chainId: 114,
    deployedAt: new Date().toISOString(),
  };
  const outPath = path.join(__dirname, "privacyRouter.deployed.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log("Wrote", outPath);
  console.log("\nSet in src/lib/uniswapConfig.ts:");
  console.log(`  privacyRouter: "${address}",`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
