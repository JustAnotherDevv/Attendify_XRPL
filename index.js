const express = require("express");
const xrpl = require("xrpl");
require("dotenv").config();
const {
  Attendify,
  ERR_ATTENDIFY,
  ERR_IPFS,
  ERR_NOT_FOUND,
  ERR_PARAMS,
  ERR_XRPL,
} = require("./attendify");
const { postToIPFS, ascii_to_hexa } = require("./helpers");

const app = express();
const port = 4000;
let AttendifyLib = new Attendify();
app.listen(port, () => {
  console.log(`XRPL Attendify server listening on port ${port}`);
});

/**
 * Creating new event
 * Contains wallet address of owner creating event, amount of NFTs to be minted, url with image for event(preferably hosted on IPFS), title for event, description of event and it's location
 */
app.get("/api/mint", (req, res) => {
  (async () => {
    try {
      const { walletAddress, tokenCount, url, title, desc, loc } =
        await req.query;
      if (
        walletAddress.length == 0 ||
        tokenCount.length == 0 ||
        url.length == 0 ||
        title.length == 0 ||
        walletAddress.length == 0 ||
        desc.length == 0 ||
        loc.length == 0
      )
        throw new Error(`${ERR_PARAMS}`);

      let metadataStructure = {
        title: title,
        description: desc,
        collectionSize: tokenCount,
        location: loc,
        date: new Date().toLocaleDateString().toString(),
        URI: url,
      };

      const metadata = await await postToIPFS(
        JSON.stringify(metadataStructure)
      ); //.substring(21);

      console.log(metadata);

      return res.send({
        result: await AttendifyLib.batchMint(
          walletAddress,
          parseInt(tokenCount),
          metadata,
          title
        ),
      });
    } catch (error) {
      console.error(error);
      res.status(500).send({
        statusText: `${error}`,
      });
    }
  })();
});

/**
 * Requesting claim for selected event
 * The sell offer that's returned has to be accepted in UI
 */
app.get("/api/claim", (req, res) => {
  (async () => {
    try {
      const { walletAddress, id } = await req.query;
      if (walletAddress.length == 0 || id.length == 0)
        throw new Error(`${ERR_PARAMS}`);
      let requestedClaim = AttendifyLib.claimable.find((obj) => {
        return AttendifyLib.claimableAdresses[obj.account].classicAddress == id;
      });
      console.log(requestedClaim);

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
          return obj === walletAddress;
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

      await AttendifyLib.claimable[requestedClaim.id].remaining--;
      AttendifyLib.claimable[requestedClaim.id].participants.push(
        walletAddress
      );
      const claimableToken = await (
        await AttendifyLib.getBatchNFTokens(id)
      ).result.account_nfts[0].NFTokenID;
      console.log(claimableToken);
      return res.send({
        status: "transferred",
        result: requestedClaim,
        claimed: await AttendifyLib.createSellOfferForClaim(
          walletAddress,
          AttendifyLib.claimableAdresses[requestedClaim.id].seed,
          claimableToken
        ),
      });
    } catch (error) {
      console.error(error);
      res.status(500).send({
        statusText: `${error}`,
      });
    }
  })();
});

/**
 * Checks whether or not requested user is eligible for the claim, if the event exists and if there are still any NFTs left
 */
app.get("/api/checkClaims", (req, res) => {
  (async () => {
    try {
      const { walletAddress, id } = await req.query;
      if (walletAddress.length == 0 || id.length == 0)
        throw new Error(`${ERR_PARAMS}`);
    } catch (error) {
      console.error(error);
      res.status(500).send({
        statusText: `${error}`,
      });
    }
    let requestedClaim = AttendifyLib.claimable.find((obj) => {
      return AttendifyLib.claimableAdresses[obj.account] == id;
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
        return obj === walletAddress;
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

/**
 * Creates new account for the end user
 * * Currently used with my UI for testing purposes
 */
app.get("/api/getNewAccount", (req, res) => {
  (async () => {
    try {
      return res.send({
        result: await AttendifyLib.getNewAccount(),
      });
    } catch (error) {
      console.error(error);
      res.status(500).send({
        statusText: `${error}`,
      });
    }
  })();
});
