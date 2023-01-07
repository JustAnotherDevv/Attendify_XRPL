const xrpl = require("xrpl");
const app = require("./index.js");
const supertest = require("supertest");
const requestWithSupertest = supertest(app);
const assert = require("assert");
var should = require("chai").should();

// Mock data for tests
const testUser = {
  publicKey:
    "ED3467208169A8978DD8A66D20D95E8AC63DD2B7675A5A072A49C58832F93A7BF0",
  privateKey:
    "EDEC608D34F5825C1EDAFC561DE2BBCB12E953CDD5D725D1691EABFECF253A195D",
  classicAddress: "rJnCJZZXSSnuDi9YVgrAatVqSvktTeXr5r",
  seed: "sEdTG44pDuiojoi7pH9R5qzytEuYurd",
};
const testNftId =
  "000300003CBB7B1E0212681492733BDA77986A6A7C4C2B4A2DCBAB9D00000002";
let walletForSignatureVerification = {
  publicKey:
    "ED57D41105FC480545763677D2100C8949324A97811FE5CB45594B5E73991BBF92",
  privateKey:
    "EDE60F3996E5A0855FEF0C1E31A894D5085294A12D364FB11421F37B7683A1F6B2",
  classicAddress: "raY33uxEbZFg7YS1ofFRioeENLsVdCgpC5",
  seed: "sEdVMJSLjuTAjaSeeZ6TEkpUWuTS83j",
};

// Empty variables for tests
let newUser;
let testEvent;
let nftOffer;

// API tests
describe("Testing typical user flow", function () {
  it("Getting new wallet account", async () => {
    return requestWithSupertest.get("/api/getNewAccount").then(async (r) => {
      console.log(JSON.parse(r.text).result);
      newUser = await JSON.parse(r.text).result;
      r.res.statusCode.should.equal(200);
      JSON.parse(r.text).result.should.be.a("object");
    });
  }).timeout(60000);

  it("Minting NFTs for new event", async () => {
    return requestWithSupertest
      .get(
        `/api/mint?walletAddress=${testUser.classicAddress}&tokenCount=5&url=ipfs://QmQDDD1cNgnyhPC4pBLZKhVeu12oyfCAJoWr1Qc1QgbkPN&title=test_title&desc=test_description&loc=Warsaw`
      )
      .then(async (r) => {
        console.log(JSON.parse(r.text).result);
        testEvent = await JSON.parse(r.text).result;
        r.res.statusCode.should.equal(200);
        JSON.parse(r.text).result.should.be.a("object");
      });
  }).timeout(600000);

  /**
   * Only uncomment if you want to test minting for 300 NFTs at the same time to see if ticketing and paginating works correctly
   * * WARNING! It might take a really long time to complete
  it("Minting NFTs with tokenCount exceding 250", async () => {
    return requestWithSupertest
      .get(
        `/api/mint?walletAddress=${testUser.classicAddress}&tokenCount=300&url=ipfs://QmQDDD1cNgnyhPC4pBLZKhVeu12oyfCAJoWr1Qc1QgbkPN&title=test_title&desc=test_description&loc=Warsaw`
      )
      .then(async (r) => {
        console.log(JSON.parse(r.text).result);
        testEvent = await JSON.parse(r.text).result;
        r.res.statusCode.should.equal(200);
        JSON.parse(r.text).result.should.be.a("object");
      });
  }).timeout(6000000);
  */

  it("Checking if it's possible to claim NFT for event", async () => {
    return requestWithSupertest
      .get(
        `/api/claim?walletAddress=${testUser.classicAddress}&id=${testEvent.account}&onlyCheckStatus=true`
      )
      .then((r) => {
        console.log(JSON.parse(r.text).result);
        r.res.statusCode.should.equal(200);
        JSON.parse(r.text).result.should.be.a("object");
        JSON.parse(r.text).status.should.equal("success");
      });
  }).timeout(600000);

  it("Claiming offer for NFT from event", async () => {
    return requestWithSupertest
      .get(
        `/api/claim?walletAddress=${testUser.classicAddress}&id=${testEvent.account}&onlyCheckStatus=false`
      )
      .then((r) => {
        console.log(JSON.parse(r.text));
        nftOffer = JSON.parse(r.text).claimed.nft_offer_index;
        r.res.statusCode.should.equal(200);
        JSON.parse(r.text).result.should.be.a("object");
        JSON.parse(r.text).status.should.equal("transferred");
      });
  }).timeout(600000);

  it("Looking up if the test user is on the attendees list for test event", async () => {
    return requestWithSupertest
      .get(`/api/attendees?id=${testEvent.account}`)
      .then((r) => {
        console.log(JSON.parse(r.text));
        r.res.statusCode.should.equal(200);
        JSON.parse(r.text).result.should.be.a("array");
        JSON.parse(r.text).result[0].should.equal(testUser.classicAddress);
      });
  }).timeout(600000);

  it("Verifying ownership of NFT", async () => {
    const myWallet = xrpl.Wallet.fromSeed(walletForSignatureVerification.seed);
    let my_seq = 21404872;
    const txJSON = {
      Account: myWallet.address,
      TransactionType: "Payment",
      Destination: "rf1BiGeXwwQoi8Z2ueFYTEXSwuJYfV2Jpn",
      Amount: "13000000",
      Flags: 2147483648,
      LastLedgerSequence: 7835923,
      Fee: "13",
      Sequence: my_seq,
    };
    const signature = await myWallet.sign(txJSON);
    return requestWithSupertest
      .get(
        `/api/verifyOwnership?walletAddress=${walletForSignatureVerification.classicAddress}&id=${testNftId}&signature=${signature.tx_blob}`
      )
      .then((r) => {
        console.log(JSON.parse(r.text));
        r.res.statusCode.should.equal(200);
        JSON.parse(r.text).result.should.be.a("boolean");
        JSON.parse(r.text).result.should.equal(true);
      });
  }).timeout(600000);
});
