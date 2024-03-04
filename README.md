# Token Vault

## Overview

Token Vault is a project for the Ethereum blockchain designed to securely manage `ERC721` tokens, facilitating the conditional retrieval and delivery of these tokens under specific circumstances. 

An example use case for this contract is a situation where tokens have been stolen from rightful owners, and then recovered by a 3rd party. It may not be safe to send the tokens back to the rightful owners until the owners perform an action such as revoking a malicious approval. The rightful token owners therefore can retrieve their tokens when they are ready to do so safely at a later time.

`ERC1155` tokens may be supported in a future version of the contract, but the primary release is focused on `ERC721`.

## Interacting With the Deployed Contract

### Externally Callable Functions

_retrieveToken_

```solidity
function retrieveToken(address _tokenContractAddress, uint256 _tokenId, bytes32[] memory _proof) external notPaused {...}
```
The `retrieveToken` function allows rightful token owners to retrieve their token from the contract. In order to call this function you must provide:

* the token contract address
* the token id
* a proof that verifies the address you are calling the function from is the rightful owner of the token

Additionally, the contract must not be `paused`.

_deliverToken_

```solidity
function deliverToken(address _tokenContractAddress, address _transferToAddress, uint256 _tokenId, bytes32[] memory _proof) external notPaused tokenDeliveryAllowed {...}
```
The `deliverToken` function allows a 3rd party account to deliver tokens to the rightful owner's address. Some example use cases for this function:
* The rightful owner would prefer to call the contract function from a "degen"/"burner" wallet, as many users like to limit contract calls from their main wallets.
* A token/project creator could "rescue" all tokens for a community, covering the gas fees to get tokens back to their rightful owners.

In order to call this function you must provide:
* the token contract address
* the address of the rightful owner of the token
* the token id
* a proof that verifies the combination of token address/token owner address/token id

Note the following restrictions as well, when considering calling this function:
* The contract must not be `paused`
* The `tokenDeliveryAllowedTimestamp` must not be `0`, and must be a timestamp that has passed (or is equal to) the current block timestamp

To add some clarity to the `tokenDeliveryAllowedTimestamp`, an example of why you may not want to initially allow token delivery could be if token owners originally lost their tokens due to a malicious approval. With token delivery allowed, theoretically the following could happen:
1. If proofs are publicly available, which is a likely scenario so users can access the data needed to interact with the contract, anybody could deliver the token back to the rightful owner.
2. If the rightful token owner had not yet revoked the malicious approval, the token could be stolen again.

Therefore, a possible way to use the `deliverToken` and `tokenDeliveryAllowedTimestamp` would be:
1. Initially set token delivery to not be enabled until 30 days in the future (for example). During this timeframe, users who had tokens stolen would have sufficient time to revoke the malicious approval that caused the token to be stolen in the first place. This will help to mitigate the situation where a token is delivered to a rightful owner with the sole purpose of stealing it away if they have the malicious approval still set. Many of these users may also choose to call the `retrieveToken` function during this timeframe.
2. Users that would rather wait to call the `deliverToken` function from a "degen"/"burner" wallet can do so after 30 days.

## Developer Details for using this Project/Repo

### Basic Project Structure
```lua
├── contracts/
│   ├── Create2Factory.sol
│   ├── TestERC721Token.sol
│   └── TokenVault.sol
├── test/
│   └── TokenVaultTesting.ts
├── scripts/
│   ├── Create2Helper.ts
│   ├── deployCreate2Factory.ts
│   ├── deployTokenVault.ts
│   ├── deployTokenVaultViaCreate2Factory.ts
│   ├── RightfulTokenOwnerFinder.ts
│   ├── generateProofsInfo.ts
│   ├── MerkleService.ts
├── hardhat.config.ts
└── package.json
```

_Contracts_

Contains the main `TokenVault.sol` contract, along with other contracts used for testing:

* `TokenVault.sol`: This is the core contract of the project. TokenVault manages the deposit, retrieval, and delivery of ERC721 tokens using Merkle proofs to verify rightful ownership before transfers.
* `TestERC721Token.sol`: A test ERC721 token contract for minting tokens, serving as a mock token for testing purposes.
* `Create2Factory.sol`: An example contract that can be used for deploying the `TokenVault` contract via a CREATE2 factory.

_test_

Contains tests for the project.

* `TokenVaultTesting.ts`: All tests for the `TokenVault` are contained in this file. Testing is done via Hardhat's typically testing approach/libraries, which are detailed [here](https://hardhat.org/hardhat-runner/docs/guides/test-contracts).


_scripts_

Contains helper scripts for the project, and scripts for deploying the contracts.

* [Create2Helper.ts](scripts/Create2Helper.ts): this script contains functions that can be used if you are planning to deploy the contract via the `CREATE2` factory process.
* [deployCreate2Factory.ts](scripts/deployCreate2Factory.ts): script for deploying the `Create2Factory.sol` contract.
* [deployTokenVault.ts](scripts/deployTokenVault.ts): script for deploying the `TokenVault.sol` contract directly/not using the `CREATE2` factory.
* [deployTokenVaultViaCreate2Factory.ts](scripts/deployTokenVaultViaCreate2Factory.ts): script for deploying `TokenVault.sol` via a deployed version of [Create2Factory.sol](contracts/Create2Factory.sol)
* [generateProofsInfo.ts](scripts/generateProofsInfo.ts): script to generate an output of rightful owners/token ids/merkle proofs for calling the contract.
* [MerkleService.ts](scripts/MerkleService.ts): functions used for generating merkle tree/root/proof info. 
* [RightfulTokenOwnerFinder.ts](scripts/RightfulTokenOwnerFinder.ts): script that uses the [Alchemy SDK](https://www.alchemy.com/sdk) to determine the addresses from which tokens for a specific ERC721 contract were stolen from. This is assuming all were stolen by the same address, otherwise it will need to be re-run for each `badActorAddress` (or modified to loop through a list of addresses).

_other files_

* `hardhat.config.ts`: Configuration file for Hardhat.
* `package.json`: Specifies project dependencies and defines scripts for running tests and other tasks.
* `.env`: file for storing secrets required for some of the [scripts](scripts/). You will need to create this file - by default it is excluded from being added to git in the `.gitignore` file. Be careful to never check in/commit your `.env` file, as there are secrets contained here in an unsecure manner. There are better, and much more secure ways of storing keys that should be used. This example is a very simple, and admittedly not great way to do this that can open you up to losing all of your funds.

The following shows what properties need to be set in the `.env` file for some of the scripts:

```bash
ALCHEMY_API_KEY_MAINNET=

MAINNET_PRIVATE_KEY=

#CREATE2 settings, if using
CREATE2_FACTORY_ADDRESS=
```

### Prerequisites

Before you start working with this project, ensure you have the following prerequisites:

Node.js: Install the latest stable version of Node.js. You can download it from [Node.js](https://nodejs.org/) official website.

Understanding of Solidity: Familiarize yourself with Solidity, the programming language used for writing smart contracts on Ethereum. The [Solidity documentation](https://docs.soliditylang.org/) is a great place to start.

Understanding of Ethereum: Gain a basic understanding of Ethereum and how blockchain technology works. [Ethereum.org's developers section](https://ethereum.org/developers/docs) provides extensive resources for all skill levels.

Hardhat Development Environment: Hardhat is a development environment to compile, deploy, test, and debug Ethereum software, and is what is used in this repo for testing/deploying. Learn more about Hardhat and how to use it for smart contract development by visiting the [Hardhat official documentation](https://hardhat.org/docs).

## Setup Instructions

1. Clone the Repository
    
    Clone this repository to your local machine using Git:

    ```bash
    git clone <repository-url>
    ```
2. Install Dependencies:

    Navigate to the project root directory in your terminal and run:
    
    ```bash
    npm install
    ```
    This command installs all necessary dependencies as listed in the package.json file.

## Running Tests

To execute automated tests for the TokenVault.sol contract, use the command:

```bash
npm run test
```

This command is defined in the `package.json` as:

```
"test": "npx hardhat clean; REPORT_GAS=true npx hardhat test --config ./hardhat.config.ts"
```

Therefore when you run this command, the following actions take place:
* hardhat cleans any existing artifacts (compiled versions of previous contracts/ouptuts)
* gas reporting is enabled
* the hardhat config is referenced

An example of the output can be seen below
```
  TokenVault Contract Tests
    retrieveToken testing
      ✔ Rightful token owner can retrieve token given valid proof
      ✔ Random account cannot take token from another address using the other address' valid proof for that token
      ✔ Random account cannot take token from another address using their own valid proof
      ✔ Random account can retrieve token from another address if merkle root is set to zero bytes
      ✔ Should revert with TokenTransferFailed if token that doesn't exist in the contract is attempted to be retrieved
      ✔ Should revert with 'Activity is paused' if contract is paused
    deliverToken testing
      ✔ Token can be transferred to rightful owners address via a transaction originated from a different address
      ✔ Token cannot be transferred to an address that is not the rightful token owner's
      ✔ Random account can retrieve token from another address if merkle root is set to the zero hash
      ✔ Should revert with TokenTransferFailed if token that doesn't exist in the contract is attempted to be retrieved
      ✔ Should revert with 'Activity is paused' if contract is paused
      ✔ Should revert with Token Delivery not yet enabled if block timestamp is before tokenDeliveryAllowedTimestamp
      ✔ Should revert with Token Delivery not yet enabled if tokenDeliveryAllowedTimestamp is set to 0
    Contract Variable Access Control
      ✔ Contract Owner can update merkle root
      ✔ Non Contract Owner cannot update merkle root
      ✔ Contract Owner can update paused state
      ✔ Non Contract Owner cannot update paused state
      ✔ Contract Owner can update tokenDeliveryAllowedTimestamp
      ✔ Non Contract Owner cannot update tokenDeliveryAllowedTimestamp
    tipJar testing
      ✔ Tip Jar properly receives funds
    verifyMerkleProof testing
      ✔ verifyMerkleProof returns true for valid proof
      ✔ verifyMerkleProof returns false for invalid proof
    Admin ERC721 Token Transfers
      ✔ Owner can admin transfer out an ERC721 token stored in Token Vault Contract
      ✔ Non Owner cannot admin transfer out an ERC721 token stored in Token Vault Contract
      ✔ Owner can admin transfer out multiple ERC721 tokens stored in Token Vault Contract
      ✔ Non Owner cannot admin transfer out multiple ERC721 tokens stored in Token Vault Contract
      ✔ Should revert with TokenTransferFailed if single token that doesn't exist in contract is attempted to be transferred out
      ✔ Should revert with TokenTransferFailed if any tokens requested as a multiple admin transfer do not exist in contract
      ✔ Should revert with TokenTransferFailed if all tokens requested as a multiple admin transfer do not exist in contract
    ETH Transfers and Withdrawals
      ✔ Contract can receive funds
      ✔ Contract Owner can retrieve funds
      ✔ Non Contract Owner cannot retrieve funds
    ERC721 on token receipt interface support
      ✔ Should support onERC721Received interface

  TokenVault Deployment Tests
    Contract ownership
      ✔ Contract owner should be set to caller's address when contract is deployed directly
      ✔ Contract owner should be set to caller's address when contract is deployed via Create2Factory
    Deployment parameters
      ✔ Merkle root should be set to expected value after deployment
      ✔ Merkle root should be set to zero hash after deployment when constructor parameter is set to zero hash during deployment
      ✔ Contract paused state should be true after deployment when constructor parameter is set to true
      ✔ Contract paused state should be false after deployment when constructor parameter is set to false
      ✔ tokenDeliveryAllowedTimestamp should be set to expected value after deployment
      ✔ tokenDeliveryAllowedTimestamp should be set to 0 when constructor parameter is set to 0

·---------------------------------------------------|---------------------------|--------------------|-----------------------------·
|               Solc version: 0.8.20                ·  Optimizer enabled: true  ·  Runs: 4200000000  ·  Block limit: 30000000 gas  │
····················································|···························|····················|······························
|  Methods                                                                                                                         │
···············|····································|·············|·············|····················|···············|··············
|  Contract    ·  Method                            ·  Min        ·  Max        ·  Avg               ·  # calls      ·  usd (avg)  │
···············|····································|·············|·············|····················|···············|··············
|  TokenVault  ·  adminTransferMultipleTokens       ·          -  ·          -  ·             78282  ·            1  ·          -  │
···············|····································|·············|·············|····················|···············|··············
|  TokenVault  ·  adminTransferToken                ·          -  ·          -  ·             65585  ·            1  ·          -  │
···············|····································|·············|·············|····················|···············|··············
|  TokenVault  ·  deliverToken                      ·      72905  ·      77287  ·             75096  ·            4  ·          -  │
···············|····································|·············|·············|····················|···············|··············
|  TokenVault  ·  retrieveToken                     ·      69923  ·      71817  ·             70870  ·            4  ·          -  │
···············|····································|·············|·············|····················|···············|··············
|  TokenVault  ·  setMerkleRoot                     ·      23835  ·      29019  ·             25563  ·            3  ·          -  │
···············|····································|·············|·············|····················|···············|··············
|  TokenVault  ·  setPaused                         ·          -  ·          -  ·             45815  ·            4  ·          -  │
···············|····································|·············|·············|····················|···············|··············
|  TokenVault  ·  setTokenDeliveryAllowedTimestamp  ·      23791  ·      28639  ·             27023  ·            3  ·          -  │
···············|····································|·············|·············|····················|···············|··············
|  TokenVault  ·  tipJar                            ·          -  ·          -  ·             22665  ·            2  ·          -  │
···············|····································|·············|·············|····················|···············|··············
|  TokenVault  ·  withdraw                          ·          -  ·          -  ·             30414  ·            2  ·          -  │
···············|····································|·············|·············|····················|···············|··············
|  Deployments                                      ·                                                ·  % of limit   ·             │
····················································|·············|·············|····················|···············|··············
|  TokenVault                                       ·     964043  ·    1004239  ·            986764  ·        3.3 %  ·          -  │
·---------------------------------------------------|-------------|-------------|--------------------|---------------|-------------·

  41 passing (2s)
```

This compiles the contracts, deploys them to a local Hardhat Ethereum network, runs the tests in `scripts/TokenVaultTesting.ts`, and then shuts down the network.

## Generating a Coverage Report

Generate a test coverage report to assess the extent to which your code is covered by tests:

```
npm run coverage
```

This command is defined in the `package.json` as:

```
"coverage": "npx hardhat clean; npx hardhat coverage --solcoverjs .solcover.js",
```

When running this, you will see a similar output as when running `npm run test`, but instead of the gas reporter, you will see a coverage report at the end:

```
...

  41 passing (1s)

-----------------|----------|----------|----------|----------|----------------|
File             |  % Stmts | % Branch |  % Funcs |  % Lines |Uncovered Lines |
-----------------|----------|----------|----------|----------|----------------|
 contracts/      |      100 |      100 |      100 |      100 |                |
  TokenVault.sol |      100 |      100 |      100 |      100 |                |
-----------------|----------|----------|----------|----------|----------------|
All files        |      100 |      100 |      100 |      100 |                |
-----------------|----------|----------|----------|----------|----------------|
```

## Deployment

### Deploying direcly to a live network

* Create a script in the `scripts/` directory for deployment.
* Update hardhat.config.ts with the configuration of your target network.

Refer to the Hardhat documentation for guidance on network configuration and deployment.

### Deploying via a CREATE2 factory

This project repo contains examples of how to deploy the contract using a `CREATE2` factory. A script is available in this repo to facilitate deploying the contract in this manner: [deployTokenVaultViaCreate2Factory.ts](scripts/deployTokenVaultViaCreate2Factory.ts). Please note this is only tested against the [Create2Factory.sol](contracts/Create2Factory.sol) factory that is present in this repo.

Further details on `CREATE2` are provided below.

#### Overview of CREATE2
`CREATE2` is an Ethereum opcode that allows for the creation of contracts with deterministic addresses. This feature is especially useful in scenarios where the ability to predict a contract's address before its deployment is necessary. Unlike the traditional `CREATE` opcode, which generates the contract address based on the creator's address and nonce, `CREATE2` generates the address using a combination of the creator's address, a salt (an arbitrary value provided by the creator), and the bytecode of the contract being created.

Another example of using CREATE2, along with further details on the opcode/factory usage can be seen via documentation provided by [Alchemy](https://docs.alchemy.com/docs/create2-an-alternative-to-deriving-contract-addresses)







