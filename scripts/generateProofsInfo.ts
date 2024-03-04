import * as dotenv from 'dotenv'
dotenv.config()
import * as fs from 'fs';

import { TokenOwnerFinder } from './RightfulTokenOwnerFinder'
import { merkleService } from './MerkleService'

// UPDATE THESE VALUES FOR YOUR PURPOSES
const tokenContractAddress = "0x..."
const badActorAddress = "0x...";

/**
 * Generates a Merkle tree for token ownership details and writes proof details to a JSON file.
 * This function orchestrates several steps to compile a comprehensive set of proof details
 * for token ownership verification. It queries token ownership details, generates a Merkle tree,
 * and formats the proofs for easy use in verification processes. The final output is written to a JSON file.
 */
async function generate() {
  const ownerDetails = await TokenOwnerFinder.findOwners(tokenContractAddress, badActorAddress);

  const standardMerkleTree = await merkleService.generateMerkleTree(ownerDetails);
  console.log(standardMerkleTree.root)

  const proofDetails = await merkleService.generateProofDetailsFromTreeDump(standardMerkleTree);

  const formattedJsonOutput = proofDetails.map(item => ({
    ...item,
    etherscan_formatted_proof: `[${item.proof.join(',')}]`
  }));

  const final = {
    merkle_root: standardMerkleTree.root,
    proof_details: formattedJsonOutput
  }

  // Convert the JavaScript object to a JSON string with pretty formatting
  const data = JSON.stringify(final, null, 2);

  // Specify the file path and name
  const filePath = './proof-details.json';

  // Write the JSON string to a file
  fs.writeFileSync(filePath, data, 'utf8');

  console.log(`Data written to ${filePath} for ${proofDetails.length} tokens`);
}
