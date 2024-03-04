import * as dotenv from 'dotenv'
dotenv.config()

import { ethers } from "hardhat";
import { create2Helper } from "./Create2Helper";

// UPDATE GAS VALUES
const gasLimit = 1_200_000
const maxFeePerGas = ethers.parseUnits("10.0", "gwei")
const maxPriorityFeePerGas = ethers.parseUnits("1.0", "gwei")

const salt = "0x..."; // salt for CREATE2

const deployTokenVaultViaCreate2Factory = async () => {
    const signers = await ethers.getSigners();
    const owner = signers[0];
    console.log(`owner is ${owner.address}`)

    const initializationCode = create2Helper.getInitCode()

    const ABI = ["function callCreate2( bytes32 salt, bytes calldata initializationCode ) external payable returns (address deploymentAddress)"]
    const contractInstance = new ethers.Contract(process.env.CREATE2_FACTORY_ADDRESS!!, ABI, await owner.provider.getSigner());

    const tokenVaultDeploy = await contractInstance.callCreate2(salt, initializationCode, {
      gasLimit: gasLimit,
      maxFeePerGas: maxFeePerGas,
      maxPriorityFeePerGas: maxPriorityFeePerGas,
    })
    const txReceipt = await tokenVaultDeploy.wait();
    console.log(`receipt: ${JSON.stringify(txReceipt)}`);
    console.log(`MevProcessor deployed to ${txReceipt.events[0].address}`)
};
