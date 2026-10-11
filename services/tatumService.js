const axios = require('axios');

const tatum = axios.create({
  baseURL: 'https://api.tatum.io/v3',
  headers: { 'x-api-key': process.env.TATUM_API_KEY }
});

function chainPath(chain) {
  if (chain === 'bsc') return 'bsc';
  if (chain === 'ltc' || chain === 'litecoin') return 'litecoin';
  return chain;
}

// ─── Wallet generate ───
exports.generateWallet = async (chain) => {
  const path = chainPath(chain);
  const { data } = await tatum.get(`/${path}/wallet`);
  return data;
};

// ─── Address derive ───
exports.generateAddress = async (chain, xpub, index) => {
  const path = chainPath(chain);
  const { data } = await tatum.get(`/${path}/address/${xpub}/${index}`);
  return data.address;
};

// ─── Deposit subscription — FIXED: validates BACKEND_URL ───
exports.subscribeDeposit = async (chain, address) => {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    throw new Error('BACKEND_URL env variable missing — cannot subscribe to Tatum webhook');
  }

  const webhookUrl = `${backendUrl}/api/tatum/webhook`;
  console.log(`📡 Subscribing ${chain} ${address} → ${webhookUrl}`);

  const { data } = await tatum.post('/notification/subscribe', {
    type: 'ADDRESS_TRANSACTION',
    attr: {
      chain: chain === 'ltc' ? 'LTC' : 'BSC',
      address,
      url: webhookUrl
    }
  });

  console.log(`✅ Subscribed ${chain} ${address}:`, JSON.stringify(data));
  return data;
};

// ═══════════════════════════════════════════════════════════
// NEW: Get address info (balance + incoming + outgoing)
// ═══════════════════════════════════════════════════════════
exports.getAddressInfo = async (chain, address) => {
  const path = chainPath(chain);
  const { data } = await tatum.get(`/${path}/address/${address}`);
  return data;
};

// ═══════════════════════════════════════════════════════════
// NEW: Get all transactions for an address
// ═══════════════════════════════════════════════════════════
exports.getAddressTransactions = async (chain, address, pageSize = 50) => {
  const path = chainPath(chain);
  const { data } = await tatum.get(`/${path}/transaction/address/${address}?pageSize=${pageSize}`);
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

// ─── LTC send ───
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
