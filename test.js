const xrpl = require("xrpl");
// In browsers, use a <script> tag. In Node.js, uncomment the following line:
// const xrpl = require('xrpl')
const { ipfsClient, globSource, create } = require("ipfs-http-client");

// Wrap code in an async function so we can use await
async function main() {
  /*console.log(await xrpl);
  // Define the network client
  const client = new xrpl.Client("wss://s.devnet.rippletest.net:51233");
  await client.connect();

  const fund_result = await client.fundWallet();
  const test_wallet = fund_result.wallet;
  console.log(fund_result);

  // ... custom code goes here

  // Disconnect when done (If you omit this, Node.js won't end the process)
  client.disconnect();*/

  function hex2a(hexx) {
    var hex = hexx.toString(); //force conversion
    var str = "";
    for (var i = 0; i < hex.length; i += 2)
      str += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return str;
  }
  var str =
    "697066733A2F2F62616679626569676479727A74357366703775646D37687537367568377932366E6634646675796C71616266336F636C67747179353566627A6469";

  console.log(hex2a(str));
}

main();
