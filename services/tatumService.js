const axios = require('axios');

const tatum = axios.create({
  baseURL: 'https://api.tatum.io/v3',
  headers: { 'x-api-key': process.env.TATUM_API_KEY }
});

exports.generateWallet = async (chain) => {
  const { data } = await tatum.get(`/${chain}/wallet`);
  return data;
};

exports.generateAddress = async (chain, xpub, index) => {
  const { data } = await tatum.get(`/${chain}/address/${xpub}/${index}`);
  return data.address;
};

exports.subscribeDeposit = async (chain, address) => {
  const { data } = await tatum.post('/notification/subscribe', {
    type: 'ADDRESS_EVENT',
    attr: { 
      chain, 
      address, 
      url: `${process.env.BACKEND_URL}/api/tatum/webhook` 
    }
  });
  return data;
};

exports.sendBEP20 = async (fromKey, to, amount) => {
  const { data } = await tatum.post('/bsc/bep20/transaction', {
    fromPrivateKey: fromKey,
    to,
    amount,
    contractAddress: '0x55d398326f99059fF775485246999027B3197955',
    digits: 18
  });
  return data.txId;
};
