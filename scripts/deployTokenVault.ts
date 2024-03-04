import { ethers } from "hardhat";

/**
 * UPDATE THESE VALUES FOR CONTRACT CONSTRUCTOR
 */
const merkleRoot = ethers.ZeroHash
const paused = true
const tokenDeliveryAllowedTimestamp = 0

/**
 * UPDATE THESE VALUES FOR GAS FEES
 */
const gasLimit = 1_300_000
const maxFeePerGas = ethers.parseUnits("10.0", "gwei")
const maxPriorityFeePerGas = ethers.parseUnits("1.0", "gwei")

async function deployTokenVault() {
  const signers = await ethers.getSigners();
  const owner = signers[0];
  console.log(owner.address);

  const TokenVault = await ethers.getContractFactory("TokenVault");
  const tokenVault = await TokenVault.connect(owner).deploy(merkleRoot, paused, tokenDeliveryAllowedTimestamp,
    {
      gasLimit: gasLimit,
      maxFeePerGas: maxFeePerGas,
      maxPriorityFeePerGas: maxPriorityFeePerGas,
    }
  );

  console.log("tokenVault deployed to:", tokenVault.target);
}
