// config/withdrawal.js
module.exports = {
  USDT: {
    currency: 'usdt',
    minWithdrawal: 3.0,          // Binance minimum (safe buffer)
    networkFee: 0.30,            // Worst-case fee for safety calculations
    displayFee: 0.02,            // Typical fee shown to users
    binanceWithdrawalFee: 0.01,  // Binance's actual fee
  },
  LTC: {
    currency: 'ltc',
    minWithdrawal: 0.002,        // Binance minimum (safe buffer)
    networkFee: 0.0005,          // Worst-case fee for safety
    displayFee: 0.00001,         // Typical median fee shown to users
    binanceWithdrawalFee: 0.001, // Binance's actual fee
  },
};
