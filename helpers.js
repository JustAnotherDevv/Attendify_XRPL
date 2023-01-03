require("dotenv").config();
const {
  ERR_ATTENDIFY,
  ERR_IPFS,
  ERR_NOT_FOUND,
  ERR_PARAMS,
  ERR_XRPL,
} = require("./attendify");

/**
 * Turns ASCII string into hex string
 * @param {string} str - ASCII string
 * @returns {string} arr1 - hex string
 */
const ascii_to_hexa = (str) => {
  var arr1 = [];
  for (var n = 0, l = str.length; n < l; n++) {
    var hex = Number(str.charCodeAt(n)).toString(16);
    arr1.push(hex);
  }
  return arr1.join("");
};

/**
 * Uploads provided data to IPFS
 * @param {object} data - Metadata object
 * @returns {string} path - hash of file uploaded to IPFS
 */
const postToIPFS = async (data) => {
  const { create } = await import("ipfs-http-client");
  let ipfs;
  let path = "";
  try {
    const authorization =
      "Basic " + btoa(process.env.INFURA_ID + ":" + process.env.INFURA_SECRET);
    ipfs = create({
      url: "https://infura-ipfs.io:5001/api/v0",
      headers: {
        authorization,
      },
    });
    const result = await ipfs.add(data);
    path = `https://ipfs.io/ipfs/${result.path}`;
    //path = `ipfs://${result.path}`;
  } catch (error) {
    console.error("IPFS error ", error);
    return error;
  }
  return path;
};

module.exports = {
  ascii_to_hexa,
  postToIPFS,
};
