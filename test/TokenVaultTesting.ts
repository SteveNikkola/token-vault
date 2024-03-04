import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, } from "hardhat";
import { merkleService } from "../scripts/MerkleService";
import { ProofDetail } from "../scripts/MerkleService";
import { TestERC721Token, TokenVault } from "../typechain-types";
import { Wallet } from "ethers";
import { create2Helper } from "../scripts/Create2Helper";
import artifact from '../../erc721-token-vault/artifacts/contracts/TokenVault.sol/TokenVault.json'

const { provider } = ethers;

let tokenVault: TokenVault; // core contract we will be testing
let testERC721Token: TestERC721Token; // minimal ERC721 contract used to enable testing

let merkleTree; // merkle tree that will be used for verifying who can transfer tokens out of the TokenVault
let merkleProofDetails: ProofDetail[]; // details needed for providing proofs

let owner: Wallet; // owner of the contracts we deploy

let tokenMinter1: Wallet; // simulate a random address that will mint one of the ERC721 tokens
let tokenMinter2: Wallet; // simulate a random address that will mint one of the ERC721 tokens
let tokenMinter3: Wallet; // simulate a random address that will mint one of the ERC721 tokens
let tokenMinter4: Wallet; // simulate a random address that will mint one of the ERC721 tokens

let randomAccount: Wallet; // simulate a random address that did not mint any of the tokens and does not have ownership of any tokens in the merkle tree

let sixtyDaysFromNow: number; // block timestamp 60 days from when fixture is loaded

describe("TokenVault Contract Tests", function () {

    /**
     * Sets up the blockchain state for running tests. Hardhat loads these pieces and takes a snapshot of the blockchain, reusing the setup
     * for each subsequent test case, rather than having to fully reload everything each time.
     * @returns components we need for running tests (deployed contracts, EOAs, merkle tree pieces, etc)
     */
    async function setupFixture() {
        const owner = new ethers.Wallet(ethers.hexlify(ethers.randomBytes(32)), provider);

        const tokenMinter1 = new ethers.Wallet(ethers.hexlify(ethers.randomBytes(32)), provider);
        const tokenMinter2 = new ethers.Wallet(ethers.hexlify(ethers.randomBytes(32)), provider);
        const tokenMinter3 = new ethers.Wallet(ethers.hexlify(ethers.randomBytes(32)), provider);
        const tokenMinter4 = new ethers.Wallet(ethers.hexlify(ethers.randomBytes(32)), provider);
        const randomAccount = new ethers.Wallet(ethers.hexlify(ethers.randomBytes(32)), provider);

        // fund each wallet with 100 ETH
        for (const wallet of [owner, tokenMinter1, tokenMinter2, tokenMinter3, tokenMinter4, randomAccount]) {
            await provider.send("hardhat_setBalance", [wallet.address, `0x${ethers.parseEther("100").toString(16)}`]);
        }

        const TestERC721Token = await ethers.getContractFactory("TestERC721Token");
        testERC721Token = await TestERC721Token.connect(owner).deploy();

        await testERC721Token.connect(tokenMinter1).freeMint(1); // token_id 1
        await testERC721Token.connect(tokenMinter2).freeMint(1); // token_id 2
        await testERC721Token.connect(tokenMinter3).freeMint(1); // token_id 3
        await testERC721Token.connect(tokenMinter4).freeMint(1); // token_id 4
        await testERC721Token.connect(tokenMinter4).freeMint(1); // token_id 5

        // generate merkle tree based on minted tokens
        const testERC721TokenAddress = await testERC721Token.getAddress();
        merkleTree = await merkleService.generateMerkleTree([
            {
                contract_address: testERC721TokenAddress,
                owner_address: tokenMinter1.address,
                id: 1,
            },
            {
                contract_address: testERC721TokenAddress,
                owner_address: tokenMinter2.address,
                id: 2,
            },
            {
                contract_address: testERC721TokenAddress,
                owner_address: tokenMinter3.address,
                id: 3,
            },
            {
                contract_address: testERC721TokenAddress,
                owner_address: tokenMinter4.address,
                id: 4,
            },
            { // this token won't actually exist in the contract and will be used to simulate a token where we have a valid proof but cannot be transferred out of token vault (as it won't exist there)
                contract_address: testERC721TokenAddress,
                owner_address: tokenMinter4.address,
                id: 5,
            }
        ])

        merkleProofDetails = await merkleService.generateProofDetailsFromTreeDump(merkleTree)

        const sixtyDaysFromNow = await time.latest() + (60 * 24 * 60 * 60);

        const TokenVault = await ethers.getContractFactory("TokenVault");
        tokenVault = await TokenVault.connect(owner).deploy(merkleTree.root, false, sixtyDaysFromNow);

        // transfer tokens 1 - 4 to the contract
        // token 5 statys in tokenMinter4's wallet
        await testERC721Token.connect(tokenMinter1).transferFrom(tokenMinter1, tokenVault, 1)
        await testERC721Token.connect(tokenMinter2).transferFrom(tokenMinter2, tokenVault, 2)
        await testERC721Token.connect(tokenMinter3).transferFrom(tokenMinter3, tokenVault, 3)
        await testERC721Token.connect(tokenMinter4).transferFrom(tokenMinter4, tokenVault, 4)

        return { tokenVault, testERC721Token, owner, merkleTree, merkleProofDetails, tokenMinter1, tokenMinter2, tokenMinter3, tokenMinter4, randomAccount, sixtyDaysFromNow };
    }

    beforeEach(async () => {
        ({ tokenVault, testERC721Token, owner, merkleTree, merkleProofDetails, tokenMinter1, tokenMinter2, tokenMinter3, tokenMinter4, randomAccount, sixtyDaysFromNow } = await loadFixture(setupFixture));
      });

    describe("retrieveToken testing", function () {
        it("Rightful token owner can retrieve token given valid proof", async function () {
            // Token Vault contract should have 4 tokens
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(4);

            // tokenMinter1 should hold 0 tokens
            expect(await testERC721Token.balanceOf(tokenMinter1.address)).to.equal(0);

            // get the ProofDetails for tokenMinter1
            const tokenMinter1ProofDetails: ProofDetail = merkleProofDetails.filter((proofDetail) => proofDetail.owner_address == tokenMinter1.address)[0]

            // sanity check that this is a valid proof
            expect(await tokenVault.verifyMerkleProof(tokenMinter1ProofDetails.token_contract_address, tokenMinter1ProofDetails.owner_address, tokenMinter1ProofDetails.token_id, tokenMinter1ProofDetails.proof)).to.be.true

            // tokenMinter1 retrieves their token and TokenRetrieved event emitted with proper args
            await expect(tokenVault.connect(tokenMinter1).retrieveToken(testERC721Token, tokenMinter1ProofDetails.token_id, tokenMinter1ProofDetails.proof))
            .to.emit(tokenVault, 'TokenRetrieved')
            .withArgs(tokenMinter1ProofDetails.token_id, tokenMinter1ProofDetails.owner_address);

            // tokenMinter1 owner should hold 1 token now
            expect(await testERC721Token.balanceOf(tokenMinter1.address)).to.equal(1);

            // Token Vault contract should have 3 tokens remaining
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(3);
        });

        it("Random account cannot take token from another address using the other address' valid proof for that token", async function () {
            // Token Vault contract should have 4 tokens
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(4);

            // tokenMinter1 should hold 0 tokens
            expect(await testERC721Token.balanceOf(tokenMinter1.address)).to.equal(0);

            // get the ProofDetails for tokenMinter1
            const tokenMinter1ProofDetails: ProofDetail = merkleProofDetails.filter((proofDetail) => proofDetail.owner_address == tokenMinter1.address)[0]

            // sanity check that this is a valid proof
            expect(await tokenVault.verifyMerkleProof(tokenMinter1ProofDetails.token_contract_address, tokenMinter1ProofDetails.owner_address, tokenMinter1ProofDetails.token_id, tokenMinter1ProofDetails.proof)).to.be.true

            // randomAccount attempts to retrieve the token assigned to tokenMinter1, using the valid proof from tokenMinter1
            await expect(tokenVault.connect(randomAccount).retrieveToken(testERC721Token, tokenMinter1ProofDetails.token_id, tokenMinter1ProofDetails.proof))
            .to.be.revertedWith("Invalid proof")

            // Token Vault contract should still hold 4 tokens
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(4);
        });

        it("Random account cannot take token from another address using their own valid proof", async function () {
            // Token Vault contract should have 4 tokens
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(4);

            // get the ProofDetails for tokenMinter1
            const tokenMinter1ProofDetails: ProofDetail = merkleProofDetails.filter((proofDetail) => proofDetail.owner_address == tokenMinter1.address)[0]

            // get the ProofDetails for tokenMinter2
            const tokenMinter2ProofDetails: ProofDetail = merkleProofDetails.filter((proofDetail) => proofDetail.owner_address == tokenMinter2.address)[0]

            // sanity check that this is a valid proof
            expect(await tokenVault.verifyMerkleProof(tokenMinter2ProofDetails.token_contract_address, tokenMinter2ProofDetails.owner_address, tokenMinter2ProofDetails.token_id, tokenMinter2ProofDetails.proof)).to.be.true

            // tokenMinter2 attempts to retrieve the token assigned to tokenMinter1, using their own proof that would otherwise be valid 
            await expect(tokenVault.connect(tokenMinter2).retrieveToken(testERC721Token, tokenMinter1ProofDetails.token_id, tokenMinter2ProofDetails.proof))
            .to.be.revertedWith("Invalid proof")

            // Token Vault contract should still hold 4 tokens
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(4);
        });

        it("Random account can retrieve token from another address if merkle root is set to zero bytes", async function () {
            // Token Vault contract should have 4 tokens
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(4);

            // randomAccount owner should hold 0 tokens
            expect(await testERC721Token.balanceOf(randomAccount.address)).to.equal(0);

            // set merkle root in contract to zero bytes
            await tokenVault.connect(owner).setMerkleRoot(ethers.ZeroHash)

            // randomAccount attempts to retrieve the token assigned to tokenMinter1, using any random proof
            await expect(tokenVault.connect(randomAccount).retrieveToken(testERC721Token, 1, [ethers.randomBytes(32)]))
            .to.not.be.reverted

            // randomAccount owner should hold 1 token now
            expect(await testERC721Token.balanceOf(randomAccount.address)).to.equal(1);

            // Token Vault contract should have 3 tokens remaining
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(3);
        });

        it("Should revert with TokenTransferFailed if token that doesn't exist in the contract is attempted to be retrieved", async function () {
            // Token Vault contract should have 4 tokens
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(4);

            // tokenMinter4 owner should hold 1 token (they minted 2, but only 1 was transferred to the contract)
            expect(await testERC721Token.balanceOf(tokenMinter4.address)).to.equal(1);

            // get the ProofDetails for tokenMinter4's second proof, which is for a token that does not exist in the contract
            const tokenMinter4ProofDetails: ProofDetail = merkleProofDetails.filter((proofDetail) => proofDetail.owner_address == tokenMinter4.address)[1]

            // sanity check that this is a valid proof
            expect(await tokenVault.verifyMerkleProof(tokenMinter4ProofDetails.token_contract_address, tokenMinter4ProofDetails.owner_address, tokenMinter4ProofDetails.token_id, tokenMinter4ProofDetails.proof)).to.be.true

            // tokenMinter4 attempts to retrieve their token (which is not held by the contract)
            await expect(tokenVault.connect(tokenMinter4).retrieveToken(testERC721Token, tokenMinter4ProofDetails.token_id, tokenMinter4ProofDetails.proof))
            .to.be.revertedWithCustomError(tokenVault, "TokenTransferFailed");

            // tokenMinter4 owner should hold 1 token still
            expect(await testERC721Token.balanceOf(tokenMinter4.address)).to.equal(1);

            // Token Vault contract should have 4 tokens still
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(4);
        });

        it("Should revert with 'Activity is paused' if contract is paused", async function () {
            // Token Vault contract should have 4 tokens
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(4);

            // tokenMinter1 should hold 0 tokens
            expect(await testERC721Token.balanceOf(tokenMinter1.address)).to.equal(0);

            // pause the contract
            await tokenVault.connect(owner).setPaused(true)

            // tokenMinter1 tries to retrieve a token
            await expect(tokenVault.connect(tokenMinter1).retrieveToken(testERC721Token, 1, [ethers.randomBytes(32)]))
            .to.be.revertedWith("Contract is paused")

            // tokenMinter1 should still hold 0 tokens
            expect(await testERC721Token.balanceOf(tokenMinter1.address)).to.equal(0);

            // Token Vault contract should still hold 4 tokens
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(4);
        });
    });

    describe("deliverToken testing", function () {
        it("Token can be transferred to rightful owners address via a transaction originated from a different address", async function () {
            // We must first simulate waiting for the token delivery to be enabled based on block timestamp
            await time.increaseTo(sixtyDaysFromNow);
            
            // Token Vault contract should have 4 tokens
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(4);

            // tokenMinter1 should hold 0 tokens
            expect(await testERC721Token.balanceOf(tokenMinter1.address)).to.equal(0);

            // get the ProofDetails for tokenMinter1
            const tokenMinter1ProofDetails: ProofDetail = merkleProofDetails.filter((proofDetail) => proofDetail.owner_address == tokenMinter1.address)[0]

            // sanity check that this is a valid proof
            expect(await tokenVault.verifyMerkleProof(tokenMinter1ProofDetails.token_contract_address, tokenMinter1ProofDetails.owner_address, tokenMinter1ProofDetails.token_id, tokenMinter1ProofDetails.proof)).to.be.true

            // tokenMinter2 facilitates sending the token to tokenMinter1 and TokenDelivered event emitted
            await expect(tokenVault.connect(tokenMinter2).deliverToken(testERC721Token, tokenMinter1ProofDetails.owner_address, tokenMinter1ProofDetails.token_id, tokenMinter1ProofDetails.proof))
            .to.emit(tokenVault, 'TokenDelivered')
            .withArgs(tokenMinter1ProofDetails.token_id, tokenMinter1ProofDetails.owner_address, tokenMinter2.address);

            // tokenMinter1 owner should hold 1 token now
            expect(await testERC721Token.balanceOf(tokenMinter1.address)).to.equal(1);

            // Token Vault contract should have 3 tokens remaining
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(3);
        });

        it("Token cannot be transferred to an address that is not the rightful token owner's", async function () {
            // We must first simulate waiting for the token delivery to be enabled based on block timestamp
            await time.increaseTo(sixtyDaysFromNow);

            // Token Vault contract should have 4 tokens
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(4);

            // tokenMinter1 should hold 0 tokens
            expect(await testERC721Token.balanceOf(tokenMinter1.address)).to.equal(0);

            // get the ProofDetails for tokenMinter1
            const tokenMinter1ProofDetails: ProofDetail = merkleProofDetails.filter((proofDetail) => proofDetail.owner_address == tokenMinter1.address)[0]

            // sanity check that this is a valid proof
            expect(await tokenVault.verifyMerkleProof(tokenMinter1ProofDetails.token_contract_address, tokenMinter1ProofDetails.owner_address, tokenMinter1ProofDetails.token_id, tokenMinter1ProofDetails.proof)).to.be.true

            // tokenMinter2 attempts to send tokenMinter1's token to their own address
            await expect(tokenVault.connect(tokenMinter2).deliverToken(testERC721Token, tokenMinter2.address, tokenMinter1ProofDetails.token_id, tokenMinter1ProofDetails.proof))
            .to.be.revertedWith("Invalid proof")

            // tokenMinter1 owner should still hold 0 tokens
            expect(await testERC721Token.balanceOf(tokenMinter1.address)).to.equal(0);

            // tokenMinter2 owner should still hold 0 tokens
            expect(await testERC721Token.balanceOf(tokenMinter1.address)).to.equal(0);

            // Token Vault contract should still have 4 tokens
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(4);
        });

        it("Random account can retrieve token from another address if merkle root is set to the zero hash", async function () {
            // We must first simulate waiting for the token delivery to be enabled based on block timestamp
            await time.increaseTo(sixtyDaysFromNow);

            // Token Vault contract should have 4 tokens
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(4);

            // randomAccount owner should hold 0 tokens
            expect(await testERC721Token.balanceOf(randomAccount.address)).to.equal(0);

            // set merkle root in contract to zero hash
            await tokenVault.connect(owner).setMerkleRoot(ethers.ZeroHash)

            // randomAccount attempts to retrieve the token assigned to tokenMinter1, using any random proof and TokenDelivered event is emitted
            await expect(tokenVault.connect(randomAccount).deliverToken(testERC721Token, randomAccount.address, 1, [ethers.randomBytes(32)]))
            .to.emit(tokenVault, 'TokenDelivered')
            .withArgs(1, randomAccount.address, randomAccount.address);

            // randomAccount owner should hold 1 token now
            expect(await testERC721Token.balanceOf(randomAccount.address)).to.equal(1);

            // Token Vault contract should have 3 tokens remaining
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(3);
        });

        it("Should revert with TokenTransferFailed if token that doesn't exist in the contract is attempted to be retrieved", async function () {
            // We must first simulate waiting for the token delivery to be enabled based on block timestamp
            await time.increaseTo(sixtyDaysFromNow);

            // Token Vault contract should have 4 tokens
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(4);

            // tokenMinter4 owner should hold 1 token (they minted 2 and 1 was transferred to the contract)
            expect(await testERC721Token.balanceOf(tokenMinter4.address)).to.equal(1);

            // get the ProofDetails for tokenMinter4's second proof, which is for a token that does not exist in the contract
            const tokenMinter4ProofDetails: ProofDetail = merkleProofDetails.filter((proofDetail) => proofDetail.owner_address == tokenMinter4.address)[1]

            // sanity check that this is a valid proof
            expect(await tokenVault.verifyMerkleProof(tokenMinter4ProofDetails.token_contract_address, tokenMinter4ProofDetails.owner_address, tokenMinter4ProofDetails.token_id, tokenMinter4ProofDetails.proof)).to.be.true

            // tokenMinter4 attempts to deliver their token (though it's not in the contract)
            await expect(tokenVault.connect(tokenMinter4).deliverToken(testERC721Token, tokenMinter4.address, tokenMinter4ProofDetails.token_id, tokenMinter4ProofDetails.proof))
            .to.be.revertedWithCustomError(tokenVault, "TokenTransferFailed");

            // tokenMinter4 owner should hold 1 token still
            expect(await testERC721Token.balanceOf(tokenMinter4.address)).to.equal(1);

            // Token Vault contract should have 4 tokens still
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(4);
        });

        it("Should revert with 'Activity is paused' if contract is paused", async function () {
            // We must first simulate waiting for the token delivery to be enabled based on block timestamp
            await time.increaseTo(sixtyDaysFromNow);

            // Token Vault contract should have 4 tokens
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(4);

            // tokenMinter1 owner should hold 0 tokens
            expect(await testERC721Token.balanceOf(tokenMinter1.address)).to.equal(0);

            // pause the contract
            await tokenVault.connect(owner).setPaused(true)

            // tokenMinter1 tries to retrieve a token
            await expect(tokenVault.connect(tokenMinter1).deliverToken(testERC721Token, ethers.ZeroAddress, 1, [ethers.randomBytes(32)]))
            .to.be.revertedWith("Contract is paused")

            // tokenMinter1 owner should still hold 0 tokens
            expect(await testERC721Token.balanceOf(tokenMinter1.address)).to.equal(0);

            // Token Vault contract should still hold 4 tokens
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(4);
        });

        it("Should revert with Token Delivery not yet enabled if block timestamp is before tokenDeliveryAllowedTimestamp", async function () {
            // Token Vault contract should have 4 tokens
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(4);

            // tokenMinter1 owner should hold 0 tokens
            expect(await testERC721Token.balanceOf(tokenMinter1.address)).to.equal(0);

            // tokenMinter1 tries to retrieve a token
            await expect(tokenVault.connect(tokenMinter1).deliverToken(testERC721Token, ethers.ZeroAddress, 1, [ethers.randomBytes(32)]))
            .to.be.revertedWith("Token delivery is not currently allowed. This may be available at a later time based on the tokenDeliveryAllowedTimestamp value.")

            // tokenMinter1 owner should still hold 0 tokens
            expect(await testERC721Token.balanceOf(tokenMinter1.address)).to.equal(0);

            // Token Vault contract should still hold 4 tokens
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(4);
        });

        it("Should revert with Token Delivery not yet enabled if tokenDeliveryAllowedTimestamp is set to 0", async function () {
            // We must first simulate waiting for the token delivery to be enabled based on block timestamp
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(4);

            // tokenMinter1 owner should hold 0 tokens
            expect(await testERC721Token.balanceOf(tokenMinter1.address)).to.equal(0);

            // verify tokenDeliveryAllowedTimestamp is initially set to sixty days from now
            expect(await tokenVault.tokenDeliveryAllowedTimestamp()).to.equal(sixtyDaysFromNow)

            // set tokenDeliveryAllowedTimestamp to 0 to disable delivery
            await tokenVault.setTokenDeliveryAllowedTimestamp(0)

            // verify tokenDeliveryAllowedTimestamp is now 0
            expect(await tokenVault.tokenDeliveryAllowedTimestamp()).to.equal(0)

            // tokenMinter1 tries to retrieve a token
            await expect(tokenVault.connect(tokenMinter1).deliverToken(testERC721Token, tokenMinter1.address, 1, [ethers.randomBytes(32)]))
            .to.be.revertedWith("Token delivery is not currently allowed. This may be available at a later time based on the tokenDeliveryAllowedTimestamp value.")

            // tokenMinter1 owner should still hold 0 tokens
            expect(await testERC721Token.balanceOf(tokenMinter1.address)).to.equal(0);

            // Token Vault contract should still hold 4 tokens
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(4);
        });
    });

    describe("Contract Variable Access Control", function () {
        it("Contract Owner can update merkle root", async function () {
            const newMerkleRoot = ethers.randomBytes(32);
            await tokenVault.connect(owner).setMerkleRoot(newMerkleRoot)

            expect(await tokenVault.merkleRoot()).to.equal(ethers.hexlify(newMerkleRoot))
        });

        it("Non Contract Owner cannot update merkle root", async function () {
            const deployedMerkleRoot = await tokenVault.merkleRoot();

            const newMerkleRoot = ethers.randomBytes(32);

            await expect(tokenVault.connect(tokenMinter1).setMerkleRoot(newMerkleRoot))
            .to.be.revertedWithCustomError(tokenVault, "OwnableUnauthorizedAccount");

            expect(await tokenVault.merkleRoot()).to.equal(ethers.hexlify(deployedMerkleRoot))
        });

        it("Contract Owner can update paused state", async function () {
            expect(await tokenVault.paused()).to.equal(false)

            await expect(tokenVault.connect(owner).setPaused(true))
            .to.not.be.reverted

            expect(await tokenVault.paused()).to.equal(true)
        });

        it("Non Contract Owner cannot update paused state", async function () {
            expect(await tokenVault.paused()).to.equal(false)

            await expect(tokenVault.connect(tokenMinter1).setPaused(true))
            .to.be.revertedWithCustomError(tokenVault, "OwnableUnauthorizedAccount");

            expect(await tokenVault.paused()).to.equal(false)
        });

        it("Contract Owner can update tokenDeliveryAllowedTimestamp", async function () {
            expect(await tokenVault.tokenDeliveryAllowedTimestamp()).to.equal(sixtyDaysFromNow);

            const now = await time.latest();

            await expect(tokenVault.connect(owner).setTokenDeliveryAllowedTimestamp(now))
            .to.not.be.reverted

            expect(await tokenVault.tokenDeliveryAllowedTimestamp()).to.equal(now)
        });

        it("Non Contract Owner cannot update tokenDeliveryAllowedTimestamp", async function () {
            expect(await tokenVault.tokenDeliveryAllowedTimestamp()).to.equal(sixtyDaysFromNow);

            const now = await time.latest();

            await expect(tokenVault.connect(tokenMinter1).setTokenDeliveryAllowedTimestamp(now))
            .to.be.revertedWithCustomError(tokenVault, "OwnableUnauthorizedAccount");

            expect(await tokenVault.tokenDeliveryAllowedTimestamp()).to.equal(sixtyDaysFromNow);
        });
    });

    describe("tipJar testing", function () {
        it("Tip Jar properly receives funds", async function () {
            expect(await ethers.provider.getBalance(tokenVault)).to.equal(0);

            const tipValue = ethers.parseEther(".01");

            await expect(tokenVault.connect(randomAccount).tipJar({value: tipValue}))
            .to.emit(tokenVault, 'TipReceived')
            .withArgs(randomAccount.address, tipValue);

            expect(await ethers.provider.getBalance(tokenVault)).to.equal(tipValue);
        });
    });

    describe("verifyMerkleProof testing", function () {
        it("verifyMerkleProof returns true for valid proof", async function () {
            // get the ProofDetails for tokenMinter1
            const tokenMinter1ProofDetails: ProofDetail = merkleProofDetails.filter((proofDetail) => proofDetail.owner_address == tokenMinter1.address)[0]

            expect(await tokenVault.verifyMerkleProof(tokenMinter1ProofDetails.token_contract_address, tokenMinter1ProofDetails.owner_address, tokenMinter1ProofDetails.token_id, tokenMinter1ProofDetails.proof)).to.be.true
        });

        it("verifyMerkleProof returns false for invalid proof", async function () {
            // get the ProofDetails for tokenMinter1
            const tokenMinter1ProofDetails: ProofDetail = merkleProofDetails.filter((proofDetail) => proofDetail.owner_address == tokenMinter1.address)[0]

            // call with an invalid token_id
            expect(await tokenVault.verifyMerkleProof(tokenMinter1ProofDetails.token_contract_address, tokenMinter1ProofDetails.owner_address, 999, tokenMinter1ProofDetails.proof)).to.be.false
        });
    });

    describe("Admin ERC721 Token Transfers", function () {
        it("Owner can admin transfer out an ERC721 token stored in Token Vault Contract", async function () {
            // Token Vault Contract owner should hold 0 tokens
            expect(await testERC721Token.balanceOf(owner.address)).to.equal(0);

            // transfer token out of Token Vault Contract to owner account
            await tokenVault.connect(owner).adminTransferToken(testERC721Token, owner, 1);

            // Token Vault Contract owner should hold 1 token
            expect(await testERC721Token.balanceOf(owner.address)).to.equal(1);
        });

        it("Non Owner cannot admin transfer out an ERC721 token stored in Token Vault Contract", async function () {
            // Token Vault Contract should hold 4 tokens
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(4);

            // transaction reverts if non owner tries to transfer token out of Token Vault Contract
            await expect(tokenVault.connect(tokenMinter1).adminTransferToken(testERC721Token, tokenMinter1, 1))
            .to.be.revertedWithCustomError(tokenVault, "OwnableUnauthorizedAccount");

            // Token Vault Contract should still hold 4 tokens
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(4);
        });

        it("Owner can admin transfer out multiple ERC721 tokens stored in Token Vault Contract", async function () {
            // owner should hold 0 tokens
            expect(await testERC721Token.balanceOf(owner.address)).to.equal(0);

            // transfer tokens out of Token Vault Contract to owner account
            await tokenVault.adminTransferMultipleTokens(testERC721Token, owner, [1, 2]);

            // owner should now hold 2 tokens
            expect(await testERC721Token.balanceOf(owner.address)).to.equal(2);
        });

        it("Non Owner cannot admin transfer out multiple ERC721 tokens stored in Token Vault Contract", async function () {
            // Token Vault Contract should hold 4 tokens
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(4);

            // transaction reverts if non owner tries to transfer token out of Token Vault Contract
            await expect(tokenVault.connect(tokenMinter1).adminTransferMultipleTokens(testERC721Token, tokenMinter1, [1, 2]))
            .to.be.revertedWithCustomError(tokenVault, "OwnableUnauthorizedAccount");

            // Token Vault Contract should still hold 4 tokens
            expect(await testERC721Token.balanceOf(tokenVault)).to.equal(4);
        });

        it("Should revert with TokenTransferFailed if single token that doesn't exist in contract is attempted to be transferred out", async function () {
            // transfer token out of Token Vault Contract to owner account
            await expect(tokenVault.connect(owner).adminTransferToken(testERC721Token, owner, 777))
            .to.be.revertedWithCustomError(tokenVault, "TokenTransferFailed");
        });

        it("Should revert with TokenTransferFailed if any tokens requested as a multiple admin transfer do not exist in contract", async function () {
            // owner should have 0 tokens
            expect(await testERC721Token.balanceOf(owner.address)).to.equal(0);

            // transfer token out of Token Vault Contract to owner account
            await expect(tokenVault.connect(owner).adminTransferMultipleTokens(testERC721Token, owner, [1, 777]))
            .to.be.revertedWithCustomError(tokenVault, "TokenTransferFailed");

            // owner should still have 0 tokens
            expect(await testERC721Token.balanceOf(owner.address)).to.equal(0);
        });

        it("Should revert with TokenTransferFailed if all tokens requested as a multiple admin transfer do not exist in contract", async function () {
            // owner should have 0 tokens
            expect(await testERC721Token.balanceOf(owner.address)).to.equal(0);

            // transfer token out of Token Vault Contract to owner account
            await expect(tokenVault.connect(owner).adminTransferMultipleTokens(testERC721Token, owner, [666, 777]))
            .to.be.revertedWithCustomError(tokenVault, "TokenTransferFailed");

            // owner should still have 0 tokens
            expect(await testERC721Token.balanceOf(owner.address)).to.equal(0);
        });
    });

    describe("ETH Transfers and Withdrawals", function () {
        it("Contract can receive funds", async function () {
            // contract initially has no funds
            expect(await ethers.provider.getBalance(tokenVault)).to.equal(ethers.parseEther("0"));

            const amountOfEtherToSend = ethers.parseEther("5");

            // construct and send a transaction to send ether to Token Vault Contract
            const tx = {
                to: tokenVault,
                value: amountOfEtherToSend
            }

            await owner.sendTransaction(tx);

            expect(await ethers.provider.getBalance(tokenVault)).to.equal(amountOfEtherToSend);
        });

        it("Contract Owner can retrieve funds", async function () {
            const amountOfEtherToSend = ethers.parseEther("5");

            // construct and send a transaction to send ether to Token Vault Contract
            const tx = {
                to: tokenVault,
                value: amountOfEtherToSend
            }

            await owner.sendTransaction(tx);

            const originalBalance = await ethers.provider.getBalance(owner.address);

            const txToWithdraw = await tokenVault.withdraw();

            // calculate how much the txn cost to withdraw
            const receipt = await txToWithdraw.wait();

            const txnCost = (receipt!!.gasUsed) * receipt!!.gasPrice;

            // get the owner's new wallet balance
            const newBalance = await ethers.provider.getBalance(owner.address);

            // confirm that the owner's new balance after withdraw is equal to the original balance + the amount withdrawn, minus the transaction fees
            // aka: original balance was 100 and we are withdrawing 5 ether. The new balance should be 105 minus gas cost for the transaction... i.e. 104.9988839028
            expect(newBalance).to.equal(originalBalance + amountOfEtherToSend - txnCost);
        });

        it("Non Contract Owner cannot retrieve funds", async function () {
            // contract initially has no funds
            expect(await ethers.provider.getBalance(tokenVault)).to.equal(ethers.parseEther("0"));

            const amountOfEtherToSend = ethers.parseEther("5");

            // construct and send a transaction to send ether to Token Vault Contract
            const tx = {
                to: tokenVault,
                value: amountOfEtherToSend
            }

            await owner.sendTransaction(tx);

            await expect(tokenVault.connect(tokenMinter1).withdraw())
            .to.be.revertedWithCustomError(tokenVault, "OwnableUnauthorizedAccount");

            // contract still has the funds that were sent to it
            expect(await ethers.provider.getBalance(tokenVault)).to.equal(amountOfEtherToSend);

        });
    });

    describe("ERC721 on token receipt interface support", function () {
        it("Should support onERC721Received interface", async function () {
            const functionSelector =  testERC721Token.interface.getFunction("onERC721Received").selector;
            expect(await tokenVault.onERC721Received(ethers.ZeroAddress, ethers.ZeroAddress, 1, ethers.randomBytes(32))).to.equal(functionSelector)
        });
    });
})

describe("TokenVault Deployment Tests", function () {
    async function setupOwner() {
        const owner = new ethers.Wallet(ethers.hexlify(ethers.randomBytes(32)), provider);
        await provider.send("hardhat_setBalance", [owner.address, `0x${ethers.parseEther("100").toString(16)}`]);

        return { owner };
    }

    beforeEach(async () => {
        ({ owner } = await loadFixture(setupOwner));
      });

    describe("Contract ownership", function () {
        it("Contract owner should be set to caller's address when contract is deployed directly", async function () {
            const TokenVault = await ethers.getContractFactory("TokenVault");

            tokenVault = await TokenVault.connect(owner).deploy(ethers.ZeroHash, true, 0);

            expect(await tokenVault.owner()).to.equal(owner.address)
        });

        it("Contract owner should be set to caller's address when contract is deployed via Create2Factory", async function () {
            const Create2Factory = await ethers.getContractFactory("Create2Factory")
            const create2Factory = await Create2Factory.connect(owner).deploy()

            const saltHex = `${owner.address}${ethers.hexlify(ethers.randomBytes(12)).slice(2)}`;
            const initCode = await create2Helper.getInitCodeExplicit(artifact, ethers.ZeroHash, true, 0)

            const expectedAddress = await create2Factory.findCreate2Address(saltHex, ethers.keccak256(initCode));
            expect((await provider.getCode(expectedAddress))).to.equal("0x")

            await create2Factory.connect(owner).callCreate2(saltHex, initCode)

            expect(await provider.getCode(expectedAddress)).to.not.equal("0x")

            const contractInstance = new ethers.Contract(expectedAddress, ["function owner() public view returns (address)"], provider);
            expect(await contractInstance.owner()).to.equal(owner.address);
        });
    });
    describe ("Deployment parameters", function() {
        it("Merkle root should be set to expected value after deployment", async function() {
            const TokenVault = await ethers.getContractFactory("TokenVault");

            const merkleRoot = ethers.hexlify(ethers.randomBytes(32))
            tokenVault = await TokenVault.connect(owner).deploy(merkleRoot, false, sixtyDaysFromNow);

            expect(await tokenVault.merkleRoot()).to.equal(merkleRoot)
        });

        it("Merkle root should be set to zero hash after deployment when constructor parameter is set to zero hash during deployment", async function() {
            const TokenVault = await ethers.getContractFactory("TokenVault");

            const merkleRoot = ethers.ZeroHash
            tokenVault = await TokenVault.connect(owner).deploy(merkleRoot, false, sixtyDaysFromNow);

            expect(await tokenVault.merkleRoot()).to.equal(merkleRoot)
        });

        it("Contract paused state should be true after deployment when constructor parameter is set to true", async function() {
            const TokenVault = await ethers.getContractFactory("TokenVault");

            const paused = true
            tokenVault = await TokenVault.connect(owner).deploy(ethers.randomBytes(32), paused, sixtyDaysFromNow);

            expect(await tokenVault.paused()).to.equal(paused)
        });

        it("Contract paused state should be false after deployment when constructor parameter is set to false", async function() {
            const TokenVault = await ethers.getContractFactory("TokenVault");

            const paused = false
            tokenVault = await TokenVault.connect(owner).deploy(ethers.randomBytes(32), paused, sixtyDaysFromNow);

            expect(await tokenVault.paused()).to.equal(paused)
        });

        it("tokenDeliveryAllowedTimestamp should be set to expected value after deployment", async function() {
            const TokenVault = await ethers.getContractFactory("TokenVault");

            const tokenDeliveryAllowedTimestamp = sixtyDaysFromNow;
            tokenVault = await TokenVault.connect(owner).deploy(ethers.randomBytes(32), true, tokenDeliveryAllowedTimestamp);

            expect(await tokenVault.tokenDeliveryAllowedTimestamp()).to.equal(tokenDeliveryAllowedTimestamp)
        });

        it("tokenDeliveryAllowedTimestamp should be set to 0 when constructor parameter is set to 0", async function() {
            const TokenVault = await ethers.getContractFactory("TokenVault");

            const tokenDeliveryAllowedTimestamp = 0;
            tokenVault = await TokenVault.connect(owner).deploy(ethers.randomBytes(32), true, tokenDeliveryAllowedTimestamp);

            expect(await tokenVault.tokenDeliveryAllowedTimestamp()).to.equal(tokenDeliveryAllowedTimestamp)
        });
    });
});