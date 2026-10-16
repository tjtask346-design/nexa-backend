// services/tatumService.js
const axios = require('axios');

const tatum = axios.create({
  baseURL: 'https://api.tatum.io',
  headers: { 'x-api-key': process.env.TATUM_API_KEY }
});

function chainPath(chain) {
  if (chain === 'bsc') return 'bsc';
  if (chain === 'ltc' || chain === 'litecoin') return 'litecoin';
  return chain;
}

// ═══════════════════════════════════════════════════════════
// WALLET / ADDRESS / KEY DERIVATION (v3)
// ═══════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════
// FIX #1: derivePrivateKey — POST (was GET)
// ═══════════════════════════════════════════════════════════
exports.derivePrivateKey = async (chain, mnemonic, index) => {
  const path = chainPath(chain);
  const { data } = await tatum.post(`/v3/${path}/wallet/priv`, {
    index: Number(index),
    mnemonic
  });
  return data.key;
};

// ═══════════════════════════════════════════════════════════
// ADDRESS BALANCE (v3)
// ═══════════════════════════════════════════════════════════
exports.getAddressInfo = async (chain, address) => {
  const path = chainPath(chain);

  // LTC (UTXO chain)
  if (chain === 'ltc' || chain === 'litecoin') {
    const { data } = await tatum.get(`/v3/${path}/address/balance/${address}`);
    return { balance: String(data?.balance ?? '0') };
  }

  // BSC native (BNB)
  const { data } = await tatum.get(`/v3/${path}/account/balance/${address}`);
  return { balance: String(data?.balance ?? '0') };
};

// ═══════════════════════════════════════════════════════════
// TRANSACTION HISTORY (v3)
// ═══════════════════════════════════════════════════════════
exports.getAddressTransactions = async (chain, address, pageSize = 50) => {
  const path = chainPath(chain);
  const { data } = await tatum.get(
    `/v3/${path}/transaction/address/${address}?pageSize=${pageSize}`
  );
  return Array.isArray(data) ? data : [];
};

// ═══════════════════════════════════════════════════════════
// SUBSCRIPTION — v4 with ADDRESS_EVENT type
// ═══════════════════════════════════════════════════════════
exports.subscribeDeposit = async (chain, address) => {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) throw new Error('BACKEND_URL missing');

  const webhookUrl = `${backendUrl}/api/tatum/webhook`;
  console.log(`📡 Subscribing ${chain} ${address} → ${webhookUrl}`);

  const chainId = chain === 'ltc' ? 'litecoin-mainnet' : 'bsc-mainnet';

  const body = {
    type: 'ADDRESS_EVENT',
    attr: {
      chain: chainId,
      address,
      url: webhookUrl
    }
  };

  try {
    const { data } = await tatum.post('/v4/subscription?type=mainnet', body);
    console.log(`✅ Subscribed ${chain} ${address}:`, JSON.stringify(data));
    return data;
  } catch (e) {
    console.error(`❌ Subscribe ${chain} failed:`, e.response?.status);
    console.error('   Tatum response body:', JSON.stringify(e.response?.data));
    console.error('   Request body sent:', JSON.stringify(body));
    throw e;
  }
};

// ═══════════════════════════════════════════════════════════
// FIX #2: getBEP20Balance — v4 wallet portfolio endpoint
// ═══════════════════════════════════════════════════════════
exports.getBEP20Balance = async (address, contractAddress) => {
  try {
    const { data } = await tatum.get('/v4/data/wallet/portfolio', {
      params: {
        chain: 'bsc-mainnet',
        addresses: address,
        tokenTypes: 'fungible'
      }
    });

    const list = Array.isArray(data) ? data : (data?.result || []);
    if (!list.length) {
      console.log('getBEP20Balance response (empty):', JSON.stringify(data).slice(0, 300));
      return 0;
    }

    const found = list.find(t => {
      const tokenAddr = (t.tokenAddress || t.contractAddress || '').toLowerCase();
      return tokenAddr === contractAddress.toLowerCase();
    });

    if (!found) {
      console.log('USDT not found in portfolio. Sample:', JSON.stringify(list[0] || {}).slice(0, 300));
      return 0;
    }

    const raw = found.balance || found.amount || '0';
    const decimals = found.decimals ?? 18;
    return parseFloat(raw) / Math.pow(10, decimals);
  } catch (e) {
    console.error('getBEP20Balance failed:', e.response?.status, e.message);
    if (e.response?.data) {
      console.error('   Tatum response:', JSON.stringify(e.response.data).slice(0, 300));
    }
    return 0;
  }
};

// ═══════════════════════════════════════════════════════════
// SEND (v3)
// ═══════════════════════════════════════════════════════════
exports.sendBEP20 = async (fromKey, to, amount) => {
  const key = fromKey.startsWith('0x') ? fromKey : '0x' + fromKey;
  const { data } = await tatum.post('/v3/bsc/bep20/transaction', {
    fromPrivateKey: key,
    to,
    amount,
    contractAddress: '0x55d398326f99059fF74527204C00D9d60e4b9b2' // placeholder
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
