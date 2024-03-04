// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC721Receiver.sol";

contract TestERC721Token is ERC721, IERC721Receiver {
    uint256 private _nextTokenCount = 1;

    function freeMint(uint256 amount) external {

        for(uint i = 0; i < amount; i++) {

            _safeMint(_msgSender(), _nextTokenCount);

            unchecked {
                _nextTokenCount++;
            }
        }
    }

    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    // ======== CONSTRUCTOR ========
    constructor() ERC721("TestERC721Token", "TEST") {}
}
