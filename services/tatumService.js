const axios = require('axios');

const tatum = axios.create({
  baseURL: 'https://api.tatum.io/v3',
  headers: { 'x-api-key': process.env.TATUM_API_KEY }
});

// ─── Tatum-এর chain নাম ম্যাপিং ───
// BSC → 'bsc', LTC → 'litecoin'
function chainPath(chain) {
  if (chain === 'bsc') return 'bsc';
  if (chain === 'ltc' || chain === 'litecoin') return 'litecoin';
  return chain;
}

// ─── Wallet generate (BSC ও LTC উভয়ের জন্য) ───
exports.generateWallet = async (chain) => {
  const path = chainPath(chain);
  const { data } = await tatum.get(`/${path}/wallet`);
  return data; // { mnemonic, xpub }
};

// ─── Address derive (xpub + index থেকে) ───
exports.generateAddress = async (chain, xpub, index) => {
  const path = chainPath(chain);
  const { data } = await tatum.get(`/${path}/address/${xpub}/${index}`);
  return data.address;
};

// ─── Deposit subscription (BSC ও LTC উভয়ের জন্য) ───
exports.subscribeDeposit = async (chain, address) => {
  const { data } = await tatum.post('/notification/subscribe', {
    type: 'ADDRESS_TRANSACTION',
    attr: {
      chain: chain === 'ltc' ? 'LTC' : 'BSC',
      address,
      url: `${process.env.BACKEND_URL}/api/tatum/webhook`
    }
  });
  return data;
};

// ─── BSC (USDT BEP20) send ───
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

// ─── LTC send (নতুন) ───
// UTXO chain-এর জন্য address-based API সহজ
exports.sendLTC = async (fromPrivateKey, fromAddress, toAddress, amount) => {
  const body = {
    fromAddress: [
      {
        address: fromAddress,
        privateKey: fromPrivateKey
      }
    ],
    to: [
      {
        address: toAddress,
        value: amount
      }
    ],
    fee: '0.0005',
    changeAddress: fromAddress
  };
  const { data } = await tatum.post('/litecoin/transaction', body);
  return data.txId;
};
