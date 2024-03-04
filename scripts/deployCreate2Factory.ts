import { ethers } from "hardhat";

/**
 * UPDATE THESE VALUES FOR GAS FEES
 */
const gasLimit = 600_000
const maxFeePerGas = ethers.parseUnits("10.0", "gwei")
const maxPriorityFeePerGas = ethers.parseUnits("1.0", "gwei")

async function deployCreate2Factory() {
  const signers = await ethers.getSigners();
  const owner = signers[0];
  console.log(owner.address);

  const Create2Factory = await ethers.getContractFactory("Create2Factory");
  const create2Factory = await Create2Factory.connect(owner).deploy(
    {
      gasLimit: gasLimit,
      maxFeePerGas: maxFeePerGas,
      maxPriorityFeePerGas: maxPriorityFeePerGas,
    }
  );

  console.log("create2Factory deployed to:", create2Factory.target);
}
