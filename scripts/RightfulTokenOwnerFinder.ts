import {Alchemy, AssetTransfersCategory, BigNumber, Network} from "alchemy-sdk";
import {AssetTransfersParams, AssetTransfersResponse} from "alchemy-sdk/dist/src/types/types";
import { AddressToTokenOwnershipDetail } from './MerkleService';

// setup our alchemy client settings
const alchemyConnectionSettings = {
    apiKey: process.env.ALCHEMY_API_KEY_MAINNET,
    network: Network.ETH_MAINNET,
};
const alchemy = new Alchemy(alchemyConnectionSettings);

const RightfulTokenOwnerFinder = {
    /**
     * Finds and returns details of tokens owned by a specified address.
     * @param tokenContractAddress The contract address of the tokens to search for.
     * @param badActorAddress The address of the token owner to investigate.
     * @returns A Promise that resolves to an array of token ownership details.
     */
    async findOwners(tokenContractAddress: string, badActorAddress: string): Promise<AddressToTokenOwnershipDetail[]> {
        // create params to limit the results of the alchemy.core.getAssetTransfers api
        let assetTransfersParams: AssetTransfersParams = {
            toAddress: badActorAddress,
            contractAddresses: [tokenContractAddress],
            category: [AssetTransfersCategory.ERC721],
        }
    
        let stolenTokenDetails: AddressToTokenOwnershipDetail[] = [];
    
        // get the first page of results, and add them to our array
        let results = await this.getAssetTransfers(assetTransfersParams);
        this.gatherStolenTokenDetails(results, stolenTokenDetails);
    
        // while our results have a pageKey property, that means there are more results to get from the API
        // iterate through the pages until we've gathered the entire mint history
        while (results.pageKey) {
            assetTransfersParams.pageKey = results.pageKey;
            results = await this.getAssetTransfers(assetTransfersParams)
            this.gatherStolenTokenDetails(results, stolenTokenDetails);
        }
        return stolenTokenDetails;
    },

    /**
     * Retrieves asset transfer information based on specified parameters.
     * @param assetTransfersParams Parameters to filter the asset transfers.
     * @returns A Promise that resolves to the asset transfers response from Alchemy.
     */
    async getAssetTransfers(assetTransfersParams: AssetTransfersParams): Promise<AssetTransfersResponse> {
        console.log(`calling alchemy.core.getAssetTransfers with params ${JSON.stringify(assetTransfersParams)}`)
        const results = await alchemy.core.getAssetTransfers(assetTransfersParams);
        console.log(`DONE calling alchemy.core.getAssetTransfers with params ${JSON.stringify(assetTransfersParams)}`)
        return results
    },
    
    /**
     * Gathers details of stolen tokens from asset transfer results and appends them to an array.
     * @param results The asset transfers response from Alchemy.
     * @param stolenTokenDetails The array to append stolen token details to.
     */
    gatherStolenTokenDetails(results: AssetTransfersResponse, stolenTokenDetails: Array<AddressToTokenOwnershipDetail>) {
        results.transfers.forEach((transfer) => {
            stolenTokenDetails.push(
                {
                    contract_address: transfer.rawContract.address,
                    owner_address: transfer.from!!,
                    id: BigNumber.from(transfer.tokenId!!).toString(),
                }
            )
        })
    }
}

export {RightfulTokenOwnerFinder as TokenOwnerFinder}
