import { mkdir, writeFile } from "node:fs/promises";
import { isAddress, getAddress } from "ethers";
import "@nomicfoundation/hardhat-ethers";
import { network } from "hardhat";

const authorityInput = process.env.AUTHORITY_ADDRESS;
const controllerInput = process.env.CONTROLLER_ADDRESS;

if (!authorityInput || !isAddress(authorityInput)) {
  throw new Error("Définis AUTHORITY_ADDRESS avec l’adresse du portefeuille de l’autorité.");
}
if (!controllerInput || !isAddress(controllerInput)) {
  throw new Error("Définis CONTROLLER_ADDRESS avec l’adresse du portefeuille du contrôleur.");
}

const authority = getAddress(authorityInput);
const controller = getAddress(controllerInput);
if (authority === controller) {
  throw new Error("AUTHORITY_ADDRESS et CONTROLLER_ADDRESS doivent être deux portefeuilles distincts.");
}

const { ethers } = await network.getOrCreate("polygonAmoy");
const [deployer] = await ethers.getSigners();
if (!deployer) throw new Error("DEPLOYER_PRIVATE_KEY est requis pour déployer le contrat.");

const chain = await ethers.provider.getNetwork();
if (chain.chainId !== 80002n) throw new Error(`Réseau inattendu : chainId ${chain.chainId}, Polygon Amoy (80002) requis.`);

const contract = await ethers.deployContract("PublicProcurement", [deployer.address, authority, controller]);
const deploymentTransaction = contract.deploymentTransaction();
if (!deploymentTransaction) throw new Error("Transaction de déploiement introuvable.");
const receipt = await deploymentTransaction.wait();
if (!receipt || receipt.status !== 1) throw new Error("Le déploiement n’a pas été confirmé avec succès.");
const address = await contract.getAddress();
const deploymentBlock = receipt.blockNumber;
const estimatedTestGasCostPOL = ethers.formatEther(receipt.gasUsed * receipt.gasPrice);
const deployment = {
  network: "Polygon Amoy",
  chainId: Number(chain.chainId),
  contract: "PublicProcurement",
  address,
  deployer: deployer.address,
  authority,
  controller,
  deploymentBlock,
  transactionHash: receipt.hash,
  gasUsed: receipt.gasUsed.toString(),
  effectiveGasPriceWei: receipt.gasPrice.toString(),
  estimatedTestGasCostPOL,
  explorer: `https://amoy.polygonscan.com/address/${address}`,
  deployedAt: new Date().toISOString(),
};

const deploymentDirectory = new URL("../deployments/", import.meta.url);
await mkdir(deploymentDirectory, { recursive: true });
await writeFile(new URL("polygonAmoy.json", deploymentDirectory), `${JSON.stringify(deployment, null, 2)}\n`, "utf8");
console.log(JSON.stringify(deployment, null, 2));