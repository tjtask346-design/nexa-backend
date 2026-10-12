// config/wallets.js
module.exports = {
  LTC: {
    mnemonic: process.env.MASTER_MNEMONIC_LTC,
    xpub: process.env.MASTER_XPUB_LTC,
    hotWallet: {
      address: process.env.HOT_WALLET_LTC_ADDRESS,
      privateKey: process.env.HOT_WALLET_LTC_KEY,
    },
    fee: '0.0001',       // sweep tx fee (LTC)
    minSweep: 0.0001,    // test: 0.0001 | prod: 0.002
  },

  BSC: {
    mnemonic: process.env.MASTER_MNEMONIC_BSC,
    xpub: process.env.MASTER_XPUB_BSC,
    hotWallet: {
      address: process.env.HOT_WALLET_BSC_ADDRESS,
      privateKey: process.env.HOT_WALLET_KEY,
    },
    usdtContract: '0x55d398326f99059fF775485246999027B3197955',
    usdtDecimals: 18,
    minSweepUSDT: 0.01,      // test: 0.01 | prod: 5
    gasTopUpBNB: '0.001',
    minGasBNB: 0.0005,
  },
};
