const xrpl = require("xrpl");
const verifySignature = require("verify-xrpl-signature").verifySignature;
require("dotenv").config();
const {
  ERR_ATTENDIFY,
  ERR_IPFS,
  ERR_NOT_FOUND,
  ERR_PARAMS,
  ERR_XRPL,
} = require("./utils");

/**
 * Attendify is API library for proof of attendance infrastructure on XRPL
 * Currently allows for creation of new claim events, checking whether claim is possible, claiming, verifying NFT ownership and fetching lsit of participants for particular event
 * @author JustAnotherDevv
 * @version 1.1.5
 */
class Attendify {
  /**
   * Runs when new instance of Atttendify class is created
   * 2 Empty arrays for claimable events and claimable adresses are initiated
   */
  constructor() {
    //list of claimable events, contains metadata, participants, amount of initial and remaining NFTs
    this.claimable = [];
    //sensitive data for addresses used for claimable events | SHOULD NEVER BE EXPOSED VIA PUBLIC API TO END USER
    this.claimableAdresses = [];
  }

  /**
   * Generates wallet address details from secret key
   * @param {string} seed - Account secret key
   * @returns {object} newWallet - Object with wallet
   */
  async getAccountFromSeed(seed) {
    try {
      if (!seed) throw new Error(`${ERR_PARAMS}`);
      const client = new xrpl.Client(process.env.SELECTED_NETWORK);
      await client.connect();
      let newWallet = await xrpl.Wallet.fromSeed(seed);
      //const standby_balance = await client.getXrpBalance(tempWallet.address);
      client.disconnect();
      return newWallet;
    } catch (error) {
      console.error(error);
      res.status(500).send({
        statusText: `${error}`,
      });
    }
  }

  /**
   * Creates new XRPL wallet and funds it
   * @returns {object} newWallet - Object with new wallet that was created and funded
   */
  async getNewAccount() {
    const client = new xrpl.Client(process.env.SELECTED_NETWORK);
    await client.connect();

    const fund_result = await client.fundWallet();
    const newWallet = fund_result.wallet;
    await client.disconnect();

    return newWallet;
  }

  /**
   * Checks for all NFTs owned by particular address
   * If account does not have any NFTs empty array is returned
   * @param {string} address - Wallet which should checked
   * @returns {object} nfts - Object with a List of NFTs owned by given address
   */
  async getBatchNFTokens(address) {
    try {
      if (!address) throw new Error(`${ERR_PARAMS}`);
      const client = new xrpl.Client(process.env.SELECTED_NETWORK);
      await client.connect();
      let nfts = await client.request({
        method: "account_nfts",
        account: address,
      });
      let accountNfts = nfts.result.account_nfts;
      console.log(nfts);
      console.log(accountNfts.length);
      for (;;) {
        if (nfts["result"]["marker"] === undefined) {
          break;
        } else {
          nfts = await client.request({
            method: "account_nfts",
            account: address,
            marker: nfts["result"]["marker"],
          });
          accountNfts = accountNfts.concat(nfts.result.account_nfts);
        }
      }
      client.disconnect();
      return accountNfts;
    } catch (error) {
      console.error(error);
      return error;
    }
  }

  /**
   * Creates offer for NFT from selected event
   * The offer has to be accepted by the buyer once it was returned
   * * In current design checks to see whether or not there are still any NFTs
   * * to claim are done outside of this class in related API route
   * @ToDo Whitelist system to only allow claiming from certain adresses
   * @ToDo Deadline system where NFTs can only be claimed before the event ends
   * @ToDo Return previously created offer for user that's already event participant
   * @param {string} buyer - wallet address of user trying to claim NFT
   * @param {string} sellerseed - seed of wallet storing NFTs from selected event
   * @param {string} TokenID - ID for NFT that should be claimed
   * @returns {string} offerToAccept - Sell offer for given NFT from selected event
   */
  async createSellOfferForClaim(buyer, sellerseed, TokenID) {
    try {
      if (!buyer || !sellerseed || !TokenID) throw new Error(`${ERR_PARAMS}`);
      const seller = xrpl.Wallet.fromSeed(sellerseed);
      const client = new xrpl.Client(process.env.SELECTED_NETWORK);
      await client.connect();
      // Preparing transaction data
      let transactionBlob = {
        TransactionType: "NFTokenCreateOffer",
        Account: seller.classicAddress,
        NFTokenID: TokenID,
        Amount: "0",
        Flags: parseInt(1),
      };
      transactionBlob.Destination = buyer;
      // Submitting transaction to XRPL
      const tx = await client.submitAndWait(transactionBlob, {
        wallet: seller,
      });
      let nftSellOffers = await client.request({
        method: "nft_sell_offers",
        nft_id: TokenID,
      });
      if (nftSellOffers == null) throw new Error(`${ERR_XRPL}`);
      // Getting details of sell offer for buyer wallet address
      let offerToAccept = nftSellOffers.result.offers.find((obj) => {
        return obj.destination === buyer;
      });
      client.disconnect();
      return offerToAccept;
    } catch (error) {
      console.error(error);
      return error;
    }
  }

  /**
   * Mints NFTs for created event and saves data about event to claimable array
   * @ToDo Currently there is new temporary wallet created for each event. Eventually it should be possible to give ownership of this wallet to owner of event
   * @ToDo In the future it should be possible for owner to edit details for event after proving ownership of his wallet by signing a message
   * @param {string} walletAddress - Account of user requesting creation of event
   * @param {integer} nftokenCount - Amount of NFTs that should be minted for event
   * @param {string} url - IPFS hash with metadata for NFT
   * @param {string} title - Name of event
   * @returns {object} claimable[curentEventId] - Contains data related to new event for which NFTs were minted
   */
  async batchMint(walletAddress, nftokenCount, url, title) {
    try {
      if (!walletAddress || !nftokenCount || !url || !title)
        throw new Error(`${ERR_PARAMS}`);
      const client = new xrpl.Client(process.env.SELECTED_NETWORK);
      await client.connect();
      const fund_result = await client.fundWallet();
      const vaultWallet = fund_result.wallet;
      let curentEventId;
      let remainingTokensBeforeTicketing = nftokenCount;
      console.log("a");
      for (let currentTickets; remainingTokensBeforeTicketing != 0; ) {
        console.log("b, ", remainingTokensBeforeTicketing);
        console.log(
          "current tickets ",
          await client.request({
            command: "account_objects",
            account: vaultWallet.address,
            type: "ticket",
          })
        );
        if (remainingTokensBeforeTicketing > 250) {
          currentTickets = 250;
        } else {
          currentTickets = remainingTokensBeforeTicketing;
        }
        // Get account information, particularly the Sequence number.
        const account_info = await client.request({
          command: "account_info",
          account: vaultWallet.address,
        });
        let my_sequence = account_info.result.account_data.Sequence;
        // Create the transaction hash.
        console.log("b, ", currentTickets);
        const ticketTransaction = await client.autofill({
          TransactionType: "TicketCreate",
          Account: vaultWallet.address,
          TicketCount: currentTickets,
          Sequence: my_sequence,
        });
        // Sign the transaction.
        const signedTransaction = vaultWallet.sign(ticketTransaction);
        // Submit the transaction and wait for the result.
        const tx = await client.submitAndWait(signedTransaction.tx_blob);
        let res = await client.request({
          command: "account_objects",
          account: vaultWallet.address,
          type: "ticket",
        });
        let resTickets = res.result.account_objects;
        console.log(resTickets.length);
        for (;;) {
          console.log("marker, ", res["result"]["marker"]);
          if (res["result"]["marker"] === undefined) {
            break;
          }

          res = await client.request({
            method: "account_objects",
            account: vaultWallet.address,
            type: "ticket",
            marker: res["result"]["marker"],
          });
          console.log(res.result.account_objects.length);
          resTickets = resTickets.concat(res.result.account_objects);
        }
        console.log("tickets amount ", resTickets.length);
        // Populate the tickets array variable.
        let tickets = [];
        for (let i = 0; i < currentTickets; i++) {
          //console.log({ index: i, res: resTickets[i] });
          tickets[i] = resTickets[i].TicketSequence;
        }
        // Mint NFTokens
        curentEventId = this.claimable.length;
        for (let i = 0; i < currentTickets; i++) {
          console.log("minting ", i);
          const transactionBlob = {
            TransactionType: "NFTokenMint",
            Account: vaultWallet.classicAddress,
            URI: xrpl.convertStringToHex(url),
            Flags: {
              tfBurnable: true,
              tfTransferable: true,
            },
            TransferFee: parseInt(0),
            Sequence: 0,
            TicketSequence: tickets[i],
            LastLedgerSequence: null,
            NFTokenTaxon: curentEventId,
          };
          // Submit signed blob.
          const tx = await client.submitAndWait(transactionBlob, {
            wallet: vaultWallet,
          });
        }
        remainingTokensBeforeTicketing -= currentTickets;
      }
      client.disconnect();
      // Save the info about newest event in claimable array
      await this.claimable.push({
        id: curentEventId,
        account: vaultWallet.classicAddress,
        owner: walletAddress,
        URI: url,
        title: title,
        claimable: nftokenCount,
        remaining: nftokenCount,
        participants: [],
      });
      await this.claimableAdresses.push(vaultWallet);
      return this.claimable[curentEventId];
    } catch (error) {
      console.error(error);
      throw new Error(error);
      // return error;
    }
  }

  /**
   * Verifies whether or not walletAddress account is owner of NFT with nftId
   * * Wallet from signature has to match walletAddress
   * @param {string} walletAddress - Address of wallet for the user wanting to verify
   * @param {string} nftId - id of NFT for which ownership should be verified
   * @param {string} signature - Signature that should be signed by the same account as walletAddress
   * @returns {boolean} Depending on whether or not walletAddress is owner of the NFT
   */
  async verifyOwnership(walletAddress, nftId, signature) {
    try {
      if (!walletAddress || !nftId || !signature)
        throw new Error(`${ERR_PARAMS}`);
      const verifySignatureResult = verifySignature(signature);
      // Checking if signature is valid and if user from signature is walletAddress
      if (
        verifySignatureResult.signatureValid != true ||
        verifySignatureResult.signedBy != walletAddress
      )
        throw new Error(`${ERR_PARAMS}`);
      let NftToVerify;
      // Getting user NFTs
      const accountNfts = await (
        await this.getBatchNFTokens(walletAddress)
      ).result.account_nfts;
      if (accountNfts.length == 0) return false;
      for (let i = 0; i != accountNfts.length; i++) {
        if (accountNfts[i].NFTokenID == nftId) {
          NftToVerify = accountNfts[i];
          return true;
        }
        if (i == accountNfts.length - 1) return false;
      }
    } catch (error) {
      console.error(error);
      return error;
    }
  }

  /**
   * Looks up the list of users that started process of claiming the NFT
   * @ToDo Add permissions to configure who can access the list of participants
   * @param {string} eventId - Id of selected claim event
   * @returns {array} selectedClaimEvent.participants - List of users that requested to participate in event
   */
  async attendeesLookup(eventId) {
    try {
      if (!eventId) throw new Error(`${ERR_PARAMS}`);
      // Find selected event
      let selectedClaimEvent = this.claimable.find((obj) => {
        return this.claimableAdresses[obj.id].classicAddress == eventId;
      });
      if (!selectedClaimEvent) throw new Error(`${ERR_ATTENDIFY}`);
      // Retrieve and return participants from claimable array
      return selectedClaimEvent.participants;
    } catch (error) {
      console.error(error);
      return error;
    }
  }
}

module.exports = {
  Attendify,
};
