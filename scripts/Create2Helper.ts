import * as dotenv from 'dotenv'
dotenv.config()

import { defaultAbiCoder } from "@ethersproject/abi"
import { keccak256 } from "@ethersproject/keccak256";

import artifact from '../artifacts/contracts/TokenVault.sol/TokenVault.json'
import { ethers } from "hardhat";
import { HashZero } from '@ethersproject/constants';

const Create2Helper = {
  /**
   * Retrieves the constructor input parameters for the TokenVault contract.
   * Update these values as needed, and then you will be able to have consistent values
   * whether getting init code or the init code hash for various purposes.
   * @returns A Promise that resolves to an object containing the artifact JSON,
   * the Merkle root, paused status, and token delivery allowed timestamp.
   */
  async getContractConstructorInputParams(): Promise<{artifactJson: any, merkleRoot: string, paused: boolean, tokenDeliveryAllowedTimestamp: number}> {
    const artifactJson = artifact;
    const merkleRoot = HashZero;
    const paused = true;
    const tokenDeliveryAllowedTimestamp = 0;

    return {artifactJson, merkleRoot, paused, tokenDeliveryAllowedTimestamp}
  },

  /**
   * Generates the initialization code for the TokenVault contract.
   * @returns A Promise that resolves to a string of the contract's bytecode appended with
   * encoded constructor parameters.
   */
  async getInitCode(): Promise<string> {
    const { merkleRoot, paused, tokenDeliveryAllowedTimestamp } = await this.getContractConstructorInputParams()
    const bytecode = artifact["bytecode"]

    const encodedParams =
      defaultAbiCoder.encode(["bytes32"], [merkleRoot]).slice(2)
      + defaultAbiCoder.encode(["bool"], [paused]).slice(2)
      + defaultAbiCoder.encode(["uint256"], [tokenDeliveryAllowedTimestamp]).slice(2);

    return bytecode + encodedParams;
  },

  /**
   * Generates the initialization code for the TokenVault contract with explicit parameters.
   * @param artifactJson The contract artifact JSON.
   * @param merkleRoot The Merkle root for the contract's Merkle tree.
   * @param paused The paused status for the contract.
   * @param tokenDeliveryAllowedTimestamp The timestamp from which token delivery is allowed.
   * @returns A Promise that resolves to a string of the contract's bytecode appended with
   * encoded constructor parameters.
   */
  async getInitCodeExplicit(artifactJson: { [x: string]: any; }, merkleRoot: string | undefined, paused: boolean | undefined, tokenDeliveryAllowedTimestamp: number | undefined): Promise<string> {
    const bytecode = artifactJson["bytecode"]

    const encodedParams =
      defaultAbiCoder.encode(["bytes32"], [merkleRoot]).slice(2)
      + defaultAbiCoder.encode(["bool"], [paused]).slice(2)
      + defaultAbiCoder.encode(["uint256"], [tokenDeliveryAllowedTimestamp]).slice(2);

    return bytecode + encodedParams;
  },

  /**
   * Computes the hash of the initialization code for the TokenVault contract.
   * @returns A Promise that resolves to the keccak256 hash of the init code.
   */
  async getInitCodeHash(): Promise<String> {
    const initCode = await this.getInitCode()
    return keccak256(initCode)
  },

  /**
   * Finds the expected address of a contract deployed using CREATE2 with the given salt.
   * @param salt The salt to use in the CREATE2 deployment process.
   * @returns A Promise that resolves to the expected deployment address of the contract.
   */
  async findCreate2Address(salt: string): Promise<string> {
    const initCodeHash = this.getInitCodeHash();

    const signers = await ethers.getSigners();
    const signer = signers[0];
    console.log(`signer address is ${signer.address}`)

    let ABI = ["function findCreate2Address( bytes32 salt, bytes32 initCodeHash ) external view returns (address deploymentAddress)"]

    const contractInstance = new ethers.Contract(process.env.CREATE2_FACTORY_ADDRESS!!, ABI, signer.provider);
    return await contractInstance.findCreate2Address(salt, initCodeHash);
  }
}

export { Create2Helper as create2Helper }
