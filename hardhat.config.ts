import * as dotenv from 'dotenv'
dotenv.config()

import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 4_200_000_000,
          },
        },
      },
    ],
  },
  networks: {
    hardhat: {
      blockGasLimit: 30_000_000,
      allowUnlimitedContractSize: false,
    },
    mainnet: {
      url: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY_MAINNET!}`,
      accounts: [
        process.env.MAINNET_PRIVATE_KEY!
      ]
    },
  },
  gasReporter: {
    excludeContracts: ['TestERC721Token.sol'],
    currency: 'USD',
    gasPriceApi: "https://api.etherscan.io/api?module=proxy&action=eth_gasPrice",
    noColors: true,
  }
};

export default config;
