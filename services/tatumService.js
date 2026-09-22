const axios = require('axios');
const tatum = axios.create({
  baseURL: 'https://api.tatum.io/v3',
  headers: { 'x-api-key': process.env.TATUM_API_KEY }
});

// User এর জন্য নতুন wallet বানানো (BSC / TRON / LTC)
exports.generateWallet = async (chain) => {
  // chain = 'tron', 'bsc', 'ltc', 'ethereum' etc
  const { data } = await tatum.get(`/${chain}/wallet`);
  return data; // { mnemonic, xpub }
}

exports.generateAddress = async (chain, xpub, index) => {
  const { data } = await tatum.get(`/${chain}/address/${xpub}/${index}`);
  return data.address;
}

// Withdraw send করা - উদাহরণ USDT BEP20
exports.sendBEP20 = async (fromPrivateKey, to, amount) => {
  const { data } = await tatum.post('/bsc/bep20/transaction', {
    fromPrivateKey,
    to,
    amount,
    contractAddress: '0x55d398326f99059fF775485246999027B3197955', // USDT BEP20 mainnet
    digits: 18
  });
  return data.txId;
}

// Webhook subscribe - deposit ধরার জন্য
exports.subscribeDeposit = async (chain, address) => {
  const { data } = await tatum.post('/notification/subscribe', {
    type: 'ADDRESS_EVENT',
    attr: { chain, address, url: 'https://nexa-backend-w3xb.onrender.com/api/tatum/webhook' }
  });
  return data;
}
