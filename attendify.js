const express = require("express");
const xrpl = require("xrpl");
require("dotenv").config();

/*
  ERROR CODES
*/
const ERR_NOT_FOUND = 404; //  Returned when requested resource was not found
const ERR_PARAMS = 100; // Returned when incorrect params were provided or when some required params were null
const ERR_IPFS = 101; // Returned if there was problem with IPFS upload
const ERR_XRPL = 102; // Returned if there was problem connecting to XRPL or querrying required data from it
const ERR_ATTENDIFY = 103; // Custom unexpected error related to Attendify library

/**
 * Attendify is API library for proof of attendance infrastructure on XRPL
 * @author JustAnotherDevv
 * @version 1.1.0
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
      if (seed == null) throw new Error(`${ERR_PARAMS}`);
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
   * @returns {array} nfts - List of NFTs owned by this address
   */
  async getBatchNFTokens(address) {
    try {
      if (address == null) throw new Error(`${ERR_PARAMS}`);
      const client = new xrpl.Client(process.env.SELECTED_NETWORK);
      await client.connect();

      let nfts = await client.request({
        method: "account_nfts",
        account: address,
      });
      client.disconnect();
      return nfts;
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
   * @param {string} buyer - wallet address of user trying to claim NFT
   * @param {string} sellerseed - seed of wallet storing NFTs from selected event
   * @param {string} TokenID - ID for NFT that should be claimed
   * @returns {string} offerToAccept - Sell offer for given NFT from selected event
   */
  async createSellOfferForClaim(buyer, sellerseed, TokenID) {
    try {
      if (buyer == null || sellerseed == null || TokenID == null)
        throw new Error(`${ERR_PARAMS}`);
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
   * @param {integer} nftokenCount
   * @param {string} url - IPFS hash with metadata for NFT
   * @param {string} title - name of event
   * @returns
   */
  async batchMint(walletAddress, nftokenCount, url, title) {
    try {
      if (
        walletAddress == null ||
        nftokenCount == null ||
        url == null ||
        title == null
      )
        throw new Error(`${ERR_PARAMS}`);
      const client = new xrpl.Client(process.env.SELECTED_NETWORK);
      await client.connect();
      const fund_result = await client.fundWallet();
      const vaultWallet = fund_result.wallet;
      // Get account information, particularly the Sequence number.
      const account_info = await client.request({
        command: "account_info",
        account: vaultWallet.address,
      });
      let my_sequence = account_info.result.account_data.Sequence;
      // Create the transaction hash.
      const ticketTransaction = await client.autofill({
        TransactionType: "TicketCreate",
        Account: vaultWallet.address,
        TicketCount: nftokenCount,
        Sequence: my_sequence,
      });
      // Sign the transaction.
      const signedTransaction = vaultWallet.sign(ticketTransaction);
      // Submit the transaction and wait for the result.
      const tx = await client.submitAndWait(signedTransaction.tx_blob);
      let response = await client.request({
        command: "account_objects",
        account: vaultWallet.address,
        type: "ticket",
      });
      // Populate the tickets array variable.
      let tickets = [];
      for (let i = 0; i < nftokenCount; i++) {
        tickets[i] = response.result.account_objects[i].TicketSequence;
      }
      // Mint NFTokens
      const curentEventId = this.claimable.length;
      for (let i = 0; i < nftokenCount; i++) {
        const transactionBlob = {
          TransactionType: "NFTokenMint",
          Account: vaultWallet.classicAddress,
          URI: xrpl.convertStringToHex(url),
          Flags: parseInt(9),
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
      return error;
    }
  }
}

module.exports = {
  Attendify,
  ERR_ATTENDIFY,
  ERR_IPFS,
  ERR_NOT_FOUND,
  ERR_PARAMS,
  ERR_XRPL,
};
