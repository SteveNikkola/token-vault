import {StandardMerkleTree} from "@openzeppelin/merkle-tree";

export interface AddressToTokenOwnershipDetail {
    contract_address: any,
    owner_address: any,
    id: any,
}

export interface ProofDetail {
    token_contract_address: string,
    owner_address: string,
    token_id: string,
    proof: string[]
}

const MerkleService = {
    /**
     * Generates a Merkle tree based on a provided array of token ownership details.
     * @param tokenArray An array of token ownership details.
     * @returns A Promise that resolves to a StandardMerkleTree object.
     */
    async generateMerkleTree(tokenArray: AddressToTokenOwnershipDetail[]): Promise<StandardMerkleTree<any[]>> {
        const merkleValues: any[][] = []

        tokenArray.forEach((token) => {
            merkleValues.push([token.contract_address, token.owner_address, token.id])
        })

        return StandardMerkleTree.of(merkleValues, ["address", "address", "uint256"]);
    },

    /**
     * Generates proof details for each entry in the given Merkle tree.
     * @param tree A StandardMerkleTree object containing token ownership details.
     * @returns A Promise that resolves to an array of ProofDetail objects.
     */
    async generateProofDetailsFromTreeDump(tree: StandardMerkleTree<any[]>): Promise<ProofDetail[]> {
        const proofDetails: ProofDetail[] = []

        for (const [i, v] of tree.entries()) {
            proofDetails.push({
                token_contract_address: v[0],
                owner_address: v[1],
                token_id: v[2],
                proof: tree.getProof(i)
            })
        }

        return proofDetails
    }
}

export {MerkleService as merkleService}
