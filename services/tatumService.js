// services/tatumService.js
const axios = require('axios');

const tatum = axios.create({
  baseURL: 'https://api.tatum.io',
  headers: { 'x-api-key': process.env.TATUM_API_KEY }
});

function chainPath(chain) {
  if (chain === 'bsc') return 'bsc';
  if (chain === 'ltc' || chain === 'litecoin') return 'litecoin';
  if (chain === 'doge' || chain === 'dogecoin') return 'dogecoin';
  return chain;
}

function v4ChainId(chain) {
  if (chain === 'ltc' || chain === 'litecoin') return 'litecoin-mainnet';
  if (chain === 'doge' || chain === 'dogecoin') return 'dogecoin-mainnet';
  if (chain === 'bsc') return 'bsc-mainnet';
  return chain;
}

// ─── Wallet / Address / Key derivation (v3 — still active) ───
exports.generateWallet = async (chain) => {
  const path = chainPath(chain);
  const { data } = await tatum.get(`/v3/${path}/wallet`);
  return data;
};

exports.generateAddress = async (chain, xpub, index) => {
  const path = chainPath(chain);
  const { data } = await tatum.get(`/v3/${path}/address/${xpub}/${index}`);
  return data.address;
};

exports.derivePrivateKey = async (chain, mnemonic, index) => {
  const path = chainPath(chain);
  const { data } = await tatum.get(`/v3/${path}/wallet/priv`, {
    params: { index, mnemonic }
  });
  return data.key;
};

// ─── Deposit subscription (v4) ───
exports.subscribeDeposit = async (chain, address) => {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) throw new Error('BACKEND_URL missing');

  const webhookUrl = `${backendUrl}/api/tatum/webhook`;
  console.log(`📡 Subscribing ${chain} ${address} → ${webhookUrl}`);

  const { data } = await tatum.post('/v4/subscription?type=mainnet', {
    type: 'ADDRESS_EVENT',
    attr: {
      chain: chain === 'ltc' ? 'LTC' : chain === 'doge' ? 'DOGE' : 'BSC',
      address,
      url: webhookUrl
    }
  });
  console.log(`✅ Subscribed ${chain} ${address}:`, JSON.stringify(data));
  return data;
};

// ─── Native balance (v4) ───
exports.getAddressInfo = async (chain, address) => {
  const chainId = v4ChainId(chain);
  try {
    const { data } = await tatum.get('/v4/data/blockchains/balance', {
      params: { chain: chainId, address }
    });
    const raw = data?.balance ?? data?.balances?.[0]?.balance ?? '0';
    return { balance: String(raw) };
  } catch (e) {
    console.error(`getAddressInfo(${chainId}) failed:`, e.response?.status, e.message);
    throw e;
  }
};

// ─── Transaction history (v4 for UTXO, v3 for BSC fallback) ───
exports.getAddressTransactions = async (chain, address, pageSize = 50) => {
  const chainId = v4ChainId(chain);

  if (chain === 'ltc' || chain === 'litecoin' || chain === 'doge' || chain === 'dogecoin') {
    const { data } = await tatum.get(
      '/v4/data/blockchains/transaction/history/utxos',
      { params: { chain: chainId, addresses: address, pageSize } }
    );
    return data?.transactions || data?.data || [];
  }

  // BSC still uses v3 for history (not yet migrated in v4 UTXO endpoint)
  const path = chainPath(chain);
  const { data } = await tatum.get(
    `/v3/${path}/transaction/address/${address}?pageSize=${pageSize}`
  );
  return data;
};

// ─── BEP20 token balance (v4) ───
exports.getBEP20Balance = async (address, contractAddress) => {
  try {
    const { data } = await tatum.get('/v4/data/balances', {
      params: {
        chain: 'bsc-mainnet',
        addresses: address,
        tokenTypes: 'fungible'
      }
    });

    const list = Array.isArray(data) ? data : (data?.balances || data?.data || []);
    const found = list.find(t =>
      (t.tokenAddress || t.contractAddress || '').toLowerCase() === contractAddress.toLowerCase()
    );

    if (!found) return 0;
    const raw = found.balance || found.amount || '0';
    const decimals = found.decimals ?? 18;
    return parseFloat(raw) / Math.pow(10, decimals);
  } catch (e) {
    console.error('getBEP20Balance failed:', e.response?.status, e.message);
    return 0;
  }
};

// ─── Send (v3 — still active) ───
exports.sendBEP20 = async (fromKey, to, amount) => {
  const key = fromKey.startsWith('0x') ? fromKey : '0x' + fromKey;
  const { data } = await tatum.post('/v3/bsc/bep20/transaction', {
    fromPrivateKey: key,
    to,
    amount,
    contractAddress: '0x55d398326f99059fF775485246999027B3197955',
    digits: 18
  });
  return data.txId;
};

exports.sendLTC = async (fromPrivateKey, fromAddress, toAddress, amount) => {
  const body = {
    fromAddress: [{ address: fromAddress, privateKey: fromPrivateKey }],
    to: [{ address: toAddress, value: amount }],
    fee: '0.0001',
    changeAddress: fromAddress
  };
  const { data } = await tatum.post('/v3/litecoin/transaction', body);
  return data.txId;
};

exports.sendBNB = async (fromPrivateKey, to, amount) => {
  const key = fromPrivateKey.startsWith('0x') ? fromPrivateKey : '0x' + fromPrivateKey;
  const { data } = await tatum.post('/v3/bsc/transaction', {
    fromPrivateKey: key,
    to,
    amount: String(amount),
    currency: 'BSC'
  });
  return data.txId;
};
