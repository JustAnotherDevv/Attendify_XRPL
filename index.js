//const cookieParser = require("cookie-parser");
const express = require("express");
const xrpl = require("xrpl");
require("dotenv").config();
const https = require("https");
//import { create, IPFSHTTPClient } from "ipfs-http-client";
const ipfsClient = require("ipfs-http-client");

const postToIPFS = async (data) => {
  let ipfs;
  let path = "";
  try {
    const authorization =
      "Basic " +
      btoa(iprocess.env.INFURA_ID + ":" + iprocess.env.INFURA_SECRET);
    ipfs = ipfsClient.create({
      url: "https://infura-ipfs.io:5001/api/v0",
      headers: {
        authorization,
      },
    });
    const result = await ipfs.add(data);
    path = `https://ipfs.io/ipfs/${result.path}`;
  } catch (error) {
    console.error("IPFS error ", error);
  }
  return path;
};

const metadataFile = "Congrats! You have uploaded your file to IPFS!";

const options = {
  host: "ipfs.infura.io",
  port: 5001,
  path: `https://ipfs.infura.io:5001/api/v0/add?file=${metadataFile}`, //"/api/v0/pin/add?arg=QmeGAVddnBSnKc1DLE7DLV9uuTqo5F7QbaveTjr45JUdQn",
  method: "POST",
  auth: projectId + ":" + projectSecret,
};

const app = express();
const port = 4000;
let standby_wallet;
//list of claimable events, contains metadata, participants, amount of initial and remaining NFTs
let claimable = [];
//sensitive data for addresses used for claimable events
let claimableAdresses = [];
(async () => {
  await getAccountFromSeed(process.env.WALLET_SEED);
})();

function ascii_to_hexa(str) {
  var arr1 = [];
  for (var n = 0, l = str.length; n < l; n++) {
    var hex = Number(str.charCodeAt(n)).toString(16);
    arr1.push(hex);
  }
  return arr1.join("");
}

async function getNewAccount() {
  const client = new xrpl.Client(process.env.SELECTED_NETWORK);
  await client.connect();

  const fund_result = await client.fundWallet();
  const new_wallet = fund_result.wallet;
  await client.disconnect();

  return new_wallet;
}

async function getAccountFromSeed(seed) {
  const client = new xrpl.Client(process.env.SELECTED_NETWORK);
  await client.connect();
  console.log("got seed: ", seed);

  // -----------------------------------Find the account wallet
  let tempWallet = await xrpl.Wallet.fromSeed(seed);

  // -----------------------------------Get the current balance.
  const standby_balance = await client.getXrpBalance(tempWallet.address);

  console.log(tempWallet);

  client.disconnect();

  if (standby_wallet == null) standby_wallet = tempWallet;

  return tempWallet;
}

async function getBatchNFTokens(address) {
  const client = new xrpl.Client(process.env.SELECTED_NETWORK);
  await client.connect();

  let nfts = await client.request({
    method: "account_nfts",
    account: address,
    limit: 400,
  });
  client.disconnect();
  return nfts;
}

async function batchMint(
  walletAddress,
  nftokenCount,
  url,
  flags,
  transferFee,
  title,
  description,
  location
) {
  //--------------------- Connect to the XRP Ledger and get the account wallet.
  let results = "";

  const client = new xrpl.Client(process.env.SELECTED_NETWORK);
  await client.connect();

  const fund_result = await client.fundWallet();
  const vault_wallet = fund_result.wallet;
  console.log(vault_wallet);

  const customData = {
    title: title,
    description: description,
    collectionSize: nftokenCount,
    location: location,
    date: new Date().toLocaleDateString().toString(),
  };

  //----------------- Get account information, particularly the Sequence number.

  const account_info = await client.request({
    command: "account_info",
    account: vault_wallet.address,
  });

  my_sequence = account_info.result.account_data.Sequence;
  results += "\n\nSequence Number: " + my_sequence + "\n\n";

  //-------------------------------------------- Create the transaction hash.
  const ticketTransaction = await client.autofill({
    TransactionType: "TicketCreate",
    Account: vault_wallet.address,
    TicketCount: nftokenCount,
    Sequence: my_sequence,
  });

  //---------------------------------------------------- Sign the transaction.
  const signedTransaction = vault_wallet.sign(ticketTransaction);

  //-------------------------- Submit the transaction and wait for the result.
  const tx = await client.submitAndWait(signedTransaction.tx_blob);

  let response = await client.request({
    command: "account_objects",
    account: vault_wallet.address,
    type: "ticket",
  });

  //------------------------------------ Populate the tickets array variable.
  let tickets = [];

  for (let i = 0; i < nftokenCount; i++) {
    tickets[i] = response.result.account_objects[i].TicketSequence;
  }
  //console.log(tickets);

  // ###################################
  // Mint NFTokens

  for (let i = 0; i < nftokenCount; i++) {
    const transactionBlob = {
      TransactionType: "NFTokenMint",
      Account: vault_wallet.classicAddress,
      URI: xrpl.convertStringToHex(url),
      Flags: parseInt(flags),
      TransferFee: parseInt(transferFee),
      Sequence: 0,
      TicketSequence: tickets[i],
      LastLedgerSequence: null,
      NFTokenTaxon: 0,
      /*Memos: [
        {
          Memo: {
            MemoType:
              "687474703a2f2f6578616d706c652e636f6d2f6d656d6f2f67656e65726963",
            MemoData: ascii_to_hexa(title),
          },
        },
      ],*/
      //customData,
    };

    //------------------------------------------------------ Submit signed blob.
    const tx = client.submit(transactionBlob, { wallet: vault_wallet });
  }
  results += "\n\nNFTs:\n";
  let nfts = await client.request({
    method: "account_nfts",
    account: vault_wallet.classicAddress,
    limit: 400,
  });

  results += JSON.stringify(nfts, null, 2);
  while (nfts.result.marker) {
    nfts = await client.request({
      method: "account_nfts",
      account: vault_wallet.classicAddress,
      limit: 400,
      marker: nfts.result.marker,
    });
    results += "\n" + JSON.stringify(nfts, null, 2);
  }

  results += "\n\nTransaction result: " + tx.result.meta.TransactionResult;
  results += "\n\nnftokens: " + JSON.stringify(nfts, null, 2);
  client.disconnect();

  await claimable.push({
    //account: walletAddress,
    id: claimable.length,
    account: claimableAdresses.length,
    URI: url,
    claimable: nftokenCount,
    remaining: nftokenCount,
    participants: [],
  });

  await claimableAdresses.push(vault_wallet);

  return results;
}

async function createSellOffer(buyerseed, sellerseed, TokenID) {
  const buyer = xrpl.Wallet.fromSeed(buyerseed);
  const seller = xrpl.Wallet.fromSeed(sellerseed);
  const client = new xrpl.Client(process.env.SELECTED_NETWORK);
  let results = "Connecting to " + process.env.SELECTED_NETWORK + "...";
  await client.connect();
  results += "\nConnected. Creating sell offer...";

  //------------------------------------- Prepare Expiration Date
  let expirationDate = null;
  // Prepare transaction -------------------------------------------------------
  let transactionBlob = {
    TransactionType: "NFTokenCreateOffer",
    Account: seller.classicAddress,
    NFTokenID: TokenID,
    Amount: "0",
    Flags: parseInt(1),
  };
  if (expirationDate != null) {
    transactionBlob.Expiration = expirationDate;
  }

  transactionBlob.Destination = buyer.classicAddress;

  // Submit transaction --------------------------------------------------------

  const tx = await client.submitAndWait(transactionBlob, {
    wallet: seller,
  });

  results += "\n\n***Sell Offers***\n";

  let nftSellOffers;
  try {
    nftSellOffers = await client.request({
      method: "nft_sell_offers",
      nft_id: TokenID,
    });
  } catch (err) {
    nftSellOffers = "No sell offers.";
  }
  results += JSON.stringify(nftSellOffers, null, 2);

  if (nftSellOffers == null) {
    client.disconnect();
    console.log("no nft offer was found, result: " + results);
    return false;
  } else {
    // Prepare transaction -------------------------------------------------------
    let offerToAccept = nftSellOffers.result.offers.find((obj) => {
      return obj.destination === buyer.classicAddress;
    });
    const transactionBlob = {
      TransactionType: "NFTokenAcceptOffer",
      Account: buyer.classicAddress,
      NFTokenSellOffer: offerToAccept.nft_offer_index,
    };
    // Submit transaction --------------------------------------------------------
    const tx = await client.submitAndWait(transactionBlob, { wallet: buyer });

    const nfts = await client.request({
      method: "account_nfts",
      account: buyer.classicAddress,
    });

    console.log(JSON.stringify(nfts));
    console.log(results);
    console.log(nfts.result.account_nfts[nfts.result.account_nfts.length - 1]);

    client.disconnect();
    return nfts.result.account_nfts[nfts.result.account_nfts.length - 1];
  }
}

app.get("/api/mint", (req, res) => {
  (async () => {
    const { walletAddress, tokenCount, url } = await req.query;

    return res.send({
      result: await batchMint(
        walletAddress,
        parseInt(tokenCount),
        url,
        parseInt(9),
        parseInt(0),
        "title",
        "description",
        "location"
      ),
    });
  })();
});

app.get("/api/claim", (req, res) => {
  (async () => {
    const { seed, id } = await req.query;
    const requestingAccount = await getAccountFromSeed(seed);
    let requestedClaim = claimable.find((obj) => {
      return claimableAdresses[obj.account].classicAddress == id;
    });
    console.log(requestedClaim);
    console.log(claimable);

    //Check if the requested claim event exists
    if (!requestedClaim) {
      return res.send({
        status: "404",
        result: "The requested claim event does not exist.",
      });
    }

    // Check if user already claimed NFT
    if (
      requestedClaim.participants.find((obj) => {
        return obj === requestingAccount.classicAddress;
      }) != undefined
    )
      return res.send({
        status: "claimed",
        result: requestedClaim,
      });

    //Check if there are any remaining NFTs
    if (requestedClaim.remaining <= 0) {
      return res.send({
        status: "empty",
        result: requestedClaim,
      });
    }

    await claimable[requestedClaim.id].remaining--;
    claimable[requestedClaim.id].participants.push(
      requestingAccount.classicAddress
    );
    const claimableToken = await (
      await getBatchNFTokens(id)
    ).result.account_nfts[0].NFTokenID;
    console.log(claimableToken);
    return res.send({
      status: "transferred",
      result: requestedClaim,
      claimed: await createSellOffer(
        seed,
        claimableAdresses[requestedClaim.id].seed,
        claimableToken
      ),
    });
  })();
});

app.get("/api/checkAllClaims", (req, res) => {
  (async () => {
    const { seed, id } = await req.query;
    return res.send({
      result: { claimable: claimable, adresses: claimableAdresses },
      //result: claimable,
    });
  })();
});

app.get("/api/checkClaims", (req, res) => {
  (async () => {
    const { seed, id } = await req.query;
    const requestingAccount = await getAccountFromSeed(seed);
    let requestedClaim = claimable.find((obj) => {
      return claimableAdresses[obj.account].classicAddress == id;
    });

    //Check if the requested claim event exists
    if (!requestedClaim) {
      return res.send({
        status: "404",
        result: "The requested claim event does not exist.",
      });
    }

    // Check if user already claimed NFT
    if (
      requestedClaim.participants.find((obj) => {
        return obj === requestingAccount.classicAddress;
      }) != undefined
    )
      return res.send({
        status: "claimed",
        result: requestedClaim,
      });

    //Check if there are any remaining NFTs
    if (requestedClaim.remaining <= 0) {
      return res.send({
        status: "empty",
        result: requestedClaim,
      });
    }

    return res.send({
      status: "success",
      result: requestedClaim,
    });
  })();
});

app.get("/api/getMyNfts", (req, res) => {
  const { walletAddress } = req.query;
  (async () => {
    var dict = {
      one: [15, 4.5],
      two: [34, 3.3],
      three: [67, 5.0],
      four: [32, 4.1],
    };
    var dictstring = await JSON.stringify(dict);

    console.log(
      await postToIPFS(
        JSON.stringify({
          description: "test 1",
        })
      )
    );

    return res.send(await getBatchNFTokens(walletAddress));
  })();
});

app.get("/api/getNewAccount", (req, res) => {
  (async () => {
    return res.send({
      result: await getNewAccount(),
    });
  })();
});

app.listen(port, () => {
  console.log(`XRPL NFT attendance server listening on port ${port}`);
});
