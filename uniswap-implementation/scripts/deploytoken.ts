import { ethers } from "hardhat";

async function deployERC20() {
    console.log("Deploying ERC20 contract...");

    const [deployer] = await ethers.getSigners();

    const nonce = await deployer.getNonce();

    const ERC20_CONTRACT_NAME = "MockToken";
    const tokenSymbol = "MOCK";
    const tokenName = "Mock Token";

    const tokenFactory = await ethers.getContractFactory(ERC20_CONTRACT_NAME);

    const token = await tokenFactory.deploy(
        tokenName,
        tokenSymbol,
        {
            nonce: nonce
        }
    );

    await token.waitForDeployment();

    console.log("Deployed Mock Token:", await token.getAddress());
}

async function main() {
    await deployERC20();
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});