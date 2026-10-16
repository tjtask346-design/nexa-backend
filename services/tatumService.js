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

exports.derivePrivateKey = async (chain, mnemonic, index) => {
  const path = chainPath(chain);
  const { data } = await tatum.get(`/v3/${path}/wallet/priv`, {
    params: { index, mnemonic }
  });
  return data.key;
};

// ═══════════════════════════════════════════════════════════
// ADDRESS BALANCE — CORRECT v3 PATHS
// ═══════════════════════════════════════════════════════════
exports.getAddressInfo = async (chain, address) => {
  const path = chainPath(chain);

  // For UTXO chains (LTC / DOGE)
  if (chain === 'ltc' || chain === 'litecoin' || chain === 'doge' || chain === 'dogecoin') {
    const { data } = await tatum.get(`/v3/${path}/address/balance/${address}`);
    return { balance: String(data?.balance ?? '0') };
  }

  // For BSC (native BNB balance)
  const { data } = await tatum.get(`/v3/${path}/account/balance/${address}`);
  return { balance: String(data?.balance ?? '0') };
};

// ═══════════════════════════════════════════════════════════
// TRANSACTION HISTORY
// ═══════════════════════════════════════════════════════════
exports.getAddressTransactions = async (chain, address, pageSize = 50) => {
  const path = chainPath(chain);
  const { data } = await tatum.get(
    `/v3/${path}/transaction/address/${address}?pageSize=${pageSize}`
  );
  return Array.isArray(data) ? data : [];
};

// ═══════════════════════════════════════════════════════════
// DEPOSIT SUBSCRIPTION (v3 — correct endpoint)
// ═══════════════════════════════════════════════════════════
exports.subscribeDeposit = async (chain, address) => {
  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) throw new Error('BACKEND_URL missing');

  const webhookUrl = `${backendUrl}/api/tatum/webhook`;
  console.log(`📡 Subscribing ${chain} ${address} → ${webhookUrl}`);

  // UTXO chains use 'UTXO' type, EVM chains use 'ADDRESS_TRANSACTION'
  const isUtxo = ['ltc', 'litecoin', 'doge', 'dogecoin'].includes(chain);
  const chainCode = chain === 'ltc' ? 'LTC'
                  : chain === 'doge' ? 'DOGE'
                  : 'BSC';

  const body = isUtxo
    ? {
        type: 'UTXO',
        attr: {
          address,
          chain: chainCode,
          url: webhookUrl
        }
      }
    : {
        type: 'ADDRESS_TRANSACTION',
        attr: {
          address,
          chain: chainCode,
          url: webhookUrl
        }
      };

  const { data } = await tatum.post('/v3/subscription', body);
  console.log(`✅ Subscribed ${chain} ${address}:`, JSON.stringify(data));
  return data;
};

// ═══════════════════════════════════════════════════════════
// BEP20 TOKEN BALANCE (USDT) — v3 correct path
// ═══════════════════════════════════════════════════════════
exports.getBEP20Balance = async (address, contractAddress) => {
  try {
    const { data } = await tatum.get(
      `/v3/bsc/bep20/balance/${address}/${contractAddress}`
    );
    const raw = data?.balance || '0';
    return parseFloat(raw) / Math.pow(10, 18);
  } catch (e) {
    console.error('getBEP20Balance failed:', e.response?.status, e.message);
    return 0;
  }
};

// ═══════════════════════════════════════════════════════════
// SEND — v3 (still active)
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
