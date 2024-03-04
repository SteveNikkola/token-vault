// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/interfaces/IERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC721Receiver.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

error TokenTransferFailed();

/**
 * @title A contract for managing ERC721 tokens to be returned to specified owners. Full project details can be found at https://github.com/SteveNikkola/token-vault
 * @author Steve Nikkola https://github.com/SteveNikkola
 * @notice This contract allows for the deposit and conditional retrieval/delivery of ERC721 tokens. An example use case for this
 * contract is a situation where tokens have been stolen from rightful owners, and then recovered by a 3rd party. It may not be safe to send the tokens back to
 * the rightful owners until the owners perform an action such as revoking a malicious approval. The rightful token owners therefore can retrieve
 * their tokens when they are ready to do so safely at a later time.
 * @dev The openzeppelin/merkle-tree javascript library was used to generate the merkle trees and merkle proofs used for testing of this contract,
 * as this is openzeppelin's recommendation in order to ensure compatibility with their smart contract libraries related to handling Merkle Proof verification.
 */
contract TokenVault is Ownable, IERC721Receiver {

    /// Root of the Merkle Tree for verification purposes.
    bytes32 public merkleRoot;

    /// Flag that determines if transferring tokens out of the contract is allowed or disabled
    bool public paused;

    /// The block timestamp at/after which token delivery is allowed via the deliverToken function
    uint256 public tokenDeliveryAllowedTimestamp;

    /** 
     * @notice Emitted when Ether is received by the contract.
     * @param sender The address of the sender who sent Ether.
     * @param amount The amount of Ether received.
     */
    event Received(address indexed sender, uint256 amount);

    /** 
     * @notice Emitted when a tip in Ether is received by the contract.
     * @param sender The address of the sender who sent the tip.
     * @param amount The amount of Ether tipped.
     */
    event TipReceived(address indexed sender, uint256 amount);

    /**
     * @notice Emitted when a token is retrieved by its owner.
     * @param tokenId The ID of the token that was retrieved.
     * @param recipient The address of the recipient who retrieved the token.
     */
    event TokenRetrieved(uint256 indexed tokenId, address recipient);

    /**
     * @notice Emitted when a token is delivered to a recipient.
     * @param tokenId The ID of the token that was delivered.
     * @param recipient The address of the recipient to whom the token was delivered.
     * @param facilitator The address of the facilitator who initiated the token delivery.
     */
    event TokenDelivered(uint256 indexed tokenId, address recipient, address facilitator);

    /// @notice Ensures that the contract is not paused.
    modifier notPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    /// @notice Ensures that token delivery is currently allowed.
    /// @dev If the tokenDeliveryAllowedTimestamp is set to the zero hash, delivery is not currently scheduled to be allowed. Otherwise, whether token delivery is allowed is based on if the block timestamp is greater than or equal to the tokenDeliveryAllowedTimestamp value.
    modifier tokenDeliveryAllowed() {
        require(tokenDeliveryAllowedTimestamp != 0 && block.timestamp >= tokenDeliveryAllowedTimestamp, "Token delivery is not currently allowed. This may be available at a later time based on the tokenDeliveryAllowedTimestamp value.");
        _;
    }

    /// @dev Ownable is set using tx.origin, rather than msg.sender, in order to allow this contract to be deployed via (for example) a proxy
    /// contract that uses CREATE2, while ensuring contract ownership is set to the original caller that initiated the transaction to deploy.
   constructor(bytes32 _merkleRoot, bool _paused, uint256 _tokenDeliveryAllowedTimestamp) Ownable(tx.origin) {
        merkleRoot = _merkleRoot;
        paused = _paused;
        tokenDeliveryAllowedTimestamp = _tokenDeliveryAllowedTimestamp;
    }

    receive() external payable {
        emit Received(msg.sender, msg.value);
    }

    /**
     * @notice Allows a user to retrieve their ERC721 token if they provide the correct Merkle proof.
     * @dev Emits a TokenRetrieved event upon successful token retrieval.
     * @param _tokenContractAddress The contract address of the token.
     * @param _tokenId The ID of the token to retrieve.
     * @param _proof The Merkle proof verifying the sender's right to retrieve the token.
     */
    function retrieveToken(address _tokenContractAddress, uint256 _tokenId, bytes32[] memory _proof) external notPaused {
        verifyAndTransfer(_tokenContractAddress, msg.sender, _tokenId, _proof);
        emit TokenRetrieved(_tokenId, msg.sender);
    }

    /**
     * @notice Allows for the delivery of a token to its rightful owner with the correct Merkle proof.
     * @dev Emits a TokenDelivered event upon successful token delivery.
     * @param _transferToAddress The address of the rightful token owner.
     * @param _tokenId The ID of the token to be delivered.
     * @param _proof The Merkle proof verifying the rightful ownership of the token.
     */
    function deliverToken(address _tokenContractAddress, address _transferToAddress, uint256 _tokenId, bytes32[] memory _proof) external notPaused tokenDeliveryAllowed {
        verifyAndTransfer(_tokenContractAddress, _transferToAddress, _tokenId, _proof);
        emit TokenDelivered(_tokenId, _transferToAddress, msg.sender);
    }

    /// @notice Deploying this contract and rescuing tokens costs ETH for gas fees. If you like my work here, any support is greatly appreciated.
    /// @dev Emits a TipReceived event upon successful tip.
    function tipJar() external payable {
        emit TipReceived(msg.sender, msg.value);
    }

    /**
     * @dev Verifies the Merkle proof and transfers the token to the specified address. If the Merkle root is set to the zero hash, merkle proof verification is not required to transfer a token.
     * @param _tokenContractAddress The contract address of the token.
     * @param _transferToAddress The address to transfer the token to.
     * @param _tokenId The ID of the token to transfer.
     * @param _proof The Merkle proof for verification.
     */
    function verifyAndTransfer(address _tokenContractAddress, address _transferToAddress, uint256 _tokenId, bytes32[] memory _proof) private {
        if (merkleRoot != bytes32(0)) {
            require(verifyMerkleProof(_tokenContractAddress, _transferToAddress, _tokenId, _proof), "Invalid proof");
        }
        transferToken(_tokenContractAddress, _transferToAddress, _tokenId);
    }

    /**
     * @notice Verifies if a leaf (the combination of the given token contract address, transfer to address, and token ID), 
     * can be proved to be a part of a Merkle tree defined by the contract's merkleRoot, given a provided merkle proof.
     * @dev If the Merkle root is not set, merkle proof verification is not required to transfer a token, and the function will return without any potential verification errors.
     * @param _tokenContractAddress The contract address of the token.
     * @param _transferToAddress The address involved in the verification.
     * @param _tokenId The ID of the token involved in the verification.
     * @param _proof The Merkle proof for verification.
     * @return bool Returns true if the Merkle root is not set (no verification needed) or if the verification succeeds. If verification fails, false is returned.
     */
    function verifyMerkleProof(address _tokenContractAddress, address _transferToAddress, uint256 _tokenId, bytes32[] memory _proof) public view returns (bool) {
        bytes32 leaf = keccak256(bytes.concat(keccak256(abi.encode(_tokenContractAddress, _transferToAddress, _tokenId))));
        if (MerkleProof.verify(_proof, merkleRoot, leaf)) {
            return true;
        }
        return false;
    }

    /**
     * @notice Attempts to transfer a token out of the contract.
     * @dev Should only be called after any necessary validations of ownership or merkle proof verification.
     * @param _tokenContractAddress The contract address of the token.
     * @param _transferToAddress The address to transfer the token to.
     * @param _tokenId The ID of the token to be transferred.
     */
    function transferToken(address _tokenContractAddress, address _transferToAddress, uint256 _tokenId) private {
        try IERC721(_tokenContractAddress).safeTransferFrom(address(this), _transferToAddress, _tokenId) {
        } catch {
            revert TokenTransferFailed();
        }
    }

    // ======== FUNCTIONS FOR UPDATING CONTRACT VARIABLES BY CONTRACT OWNER ========
    /**
     * @notice Sets the contract's merkle root, used for verifying ownership of a token before allowing it to be transferred out of the contract.
     * @param _merkleRoot Root of the Merkle Tree for verification purposes.
     */
    function setMerkleRoot(bytes32 _merkleRoot) external onlyOwner {
        merkleRoot = _merkleRoot;
    }

    /// @notice Pauses or unpauses whether tokens can be transferred out of the contract. When paused, the contract owner can still transfer tokens.
    /// @param _paused The boolean value to pause (true) or unpause (false) the contract.
    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
    }

    /// @notice Sets the timestamp from which the token delivery function is allowed. If the block timestamp is greater than or equal to this value, the token delivery function can potentially be called successfully (depending on other checks/validations). If this value is set to '0', token delivery is not allowed, regardless of block timestamp.
    /// @param _tokenDeliveryAllowedTimestamp The block timestamp at/after which token delivery is allowed.
    function setTokenDeliveryAllowedTimestamp(uint256 _tokenDeliveryAllowedTimestamp) external onlyOwner {
        tokenDeliveryAllowedTimestamp = _tokenDeliveryAllowedTimestamp;
    }

    // ======== FUNCTIONS TO ALLOW FOR RECEIVING AND ADMIN TRANSFERRING ERC721 TOKENS ========
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }

    /**
     * @notice Contract owner can transfer a single token out of the contract, without any merkle verification, 
     * regardless of whether the contract is paused or not.
     * @param _tokenContractAddress The contract address of the token.
     * @param _transferToAddress The address to transfer the token to.
     * @param _tokenId The ID of the token to be transferred.
     */
    function adminTransferToken(address _tokenContractAddress, address _transferToAddress, uint256 _tokenId) external onlyOwner {
        transferToken(_tokenContractAddress, _transferToAddress, _tokenId);
    }

    /**
     * @notice Contract owner can transfer multiple tokens out of the contract, without any merkle verification, 
     * regardless of whether the contract is paused or not. Cannot mix tokens from different token contracts - all must be associated 
     * with the same _tokenContractAddress.
     * @param _tokenContractAddress The contract address of the token.
     * @param _transferToAddress The address to transfer the token to.
     * @param _tokenIds Array of token IDs to be transferred.
     */
    function adminTransferMultipleTokens(address _tokenContractAddress, address _transferToAddress, uint256[] calldata _tokenIds) external onlyOwner {
        for (uint256 i; i < _tokenIds.length; i++) {
            transferToken(_tokenContractAddress, _transferToAddress, _tokenIds[i]);
        }
    }

    // ======== FUNCTIONS FOR WITHDRAWING ETH ========
    function withdraw() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }
}