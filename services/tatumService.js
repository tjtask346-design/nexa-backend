// services/tatumService.js
const axios = require('axios');

// Base URL এখন https://api.tatum.io (v3/v4 দুইটাই এখান থেকে চলবে)
const tatum = axios.create({
  baseURL: 'https://api.tatum.io',
  headers: { 'x-api-key': process.env.TATUM_API_KEY }
});

function chainPath(chain) {
  if (chain === 'bsc') return 'bsc';
  if (chain === 'ltc' || chain === 'litecoin') return 'litecoin';
  return chain;
}

// v4 chain identifier
function v4ChainId(chain) {
  if (chain === 'ltc' || chain === 'litecoin') return 'litecoin-mainnet';
  if (chain === 'bsc') return 'bsc-mainnet';
  return chain;
}

// ═══════════════════════════════════════════════════════════
// WALLET (still v3 — not migrated by Tatum)
// ═══════════════════════════════════════════════════════════

// ─── Wallet generate ───
exports.generateWallet = async (chain) => {
  const path = chainPath(chain);
  const { data } = await tatum.get(`/v3/${path}/wallet`);
  return data;
};

// ─── Address derive ───
exports.generateAddress = async (chain, xpub, index) => {
  const path = chainPath(chain);
  const { data } = await tatum.get(`/v3/${path}/address/${xpub}/${index}`);
  return data.address;
};

// ─── Derive private key from mnemonic + index ───
exports.derivePrivateKey = async (chain, mnemonic, index) => {
  const path = chainPath(chain);
  const { data } = await tatum.get(`/v3/${path}/wallet/priv`, {
    params: { index, mnemonic }
  });
  return data.key;
};

// ═══════════════════════════════════════════════════════════
// NOTIFICATION (v4)
// ═══════════════════════════════════════════════════════════
exports.subscribeDeposit = async (chain, address) => {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    throw new Error('BACKEND_URL env variable missing — cannot subscribe to Tatum webhook');
  }

  const webhookUrl = `${backendUrl}/api/tatum/webhook`;
  console.log(`📡 Subscribing ${chain} ${address} → ${webhookUrl}`);

  const { data } = await tatum.post('/v4/subscription?type=mainnet', {
    type: 'ADDRESS_EVENT',
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
// ADDRESS INFO (v4 — unified native balance endpoint)
// ═══════════════════════════════════════════════════════════
exports.getAddressInfo = async (chain, address) => {
  const chainId = v4ChainId(chain);
  try {
    const { data } = await tatum.get('/v4/data/blockchains/balance', {
      params: { chain: chainId, address }
    });
    // v4 response may vary — log for debugging
    // Expected shape: { balance: "123.456" } or { balances: [...] }
    const raw = data?.balance ?? data?.balances?.[0]?.balance ?? '0';
    return { balance: String(raw) };
  } catch (e) {
    console.error(`getAddressInfo(${chainId}) failed:`, e.response?.status, e.message);
    throw e;
  }
};

// ═══════════════════════════════════════════════════════════
// TRANSACTIONS (v4 — UTXO history for LTC)
// ═══════════════════════════════════════════════════════════
exports.getAddressTransactions = async (chain, address, pageSize = 50) => {
  const chainId = v4ChainId(chain);

  // LTC is UTXO-based
  if (chain === 'ltc' || chain === 'litecoin') {
    const { data } = await tatum.get(
      '/v4/data/blockchains/transaction/history/utxos',
      {
        params: {
          chain: chainId,
          addresses: address,
          pageSize
        }
      }
    );
    return data?.transactions || data?.data || [];
  }

  // BSC (EVM-based) fallback — keep v3 for now as v4 EVM history uses different path
  const path = chainPath(chain);
  const { data } = await tatum.get(
    `/v3/${path}/transaction/address/${address}?pageSize=${pageSize}`
  );
  return data;
};

// ═══════════════════════════════════════════════════════════
// BEP20 TOKEN BALANCE (v4 — wallet portfolio)
// ═══════════════════════════════════════════════════════════
exports.getBEP20Balance = async (address, contractAddress) => {
  try {
    // v4 endpoint: /v4/data/balances
    const { data } = await tatum.get('/v4/data/balances', {
      params: {
        chain: 'bsc-mainnet',
        addresses: address,
        tokenTypes: 'fungible'
      }
    });

    // response shape can be array or object
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

// ═══════════════════════════════════════════════════════════
// SEND (still v3 — not migrated)
// ═══════════════════════════════════════════════════════════
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
