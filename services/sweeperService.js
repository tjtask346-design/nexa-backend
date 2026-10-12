// services/sweeperService.js
const tatumService = require('./tatumService');
const User = require('../models/User');
const config = require('../config/wallets');

let isSweeping = false;

async function sweepLTC(user) {
  if (!user.ltcAddress) return { skipped: 'no-address' };

  const index = user.wallets?.ltcWalletIndex;
  if (index === null || index === undefined) return { skipped: 'no-index' };

  if (!config.LTC.mnemonic || !config.LTC.hotWallet.address) {
    return { error: 'LTC master config missing' };
  }

  let balance = 0;
  try {
    const info = await tatumService.getAddressInfo('ltc', user.ltcAddress);
    balance = parseFloat(info?.balance || 0);
  } catch (e) {
    return { error: `balance fetch: ${e.message}` };
  }

  if (balance <= 0) return { skipped: 'empty' };
  if (balance <= config.LTC.minSweep) return { skipped: 'dust', balance };

  const fee = parseFloat(config.LTC.fee);
  const sendAmount = +(balance - fee).toFixed(8);
  if (sendAmount <= 0) return { skipped: 'fee-exceeds' };

  let privKey;
  try {
    privKey = await tatumService.derivePrivateKey(
      'ltc', config.LTC.mnemonic, index
    );
  } catch (e) {
    return { error: `derive key: ${e.message}` };
  }

  try {
    const txId = await tatumService.sendLTC(
      privKey,
      user.ltcAddress,
      config.LTC.hotWallet.address,
      sendAmount
    );
    console.log(`🔄 LTC swept: ${sendAmount} | ${user.ltcAddress} → hot | ${txId}`);
    return { swept: sendAmount, txId };
  } catch (e) {
    return { error: `send: ${e.message}` };
  }
}

async function sweepBSC_USDT(user) {
  const addr = user.wallets?.bscAddress;
  const index = user.wallets?.walletIndex;
  if (!addr) return { skipped: 'no-address' };
  if (index === null || index === undefined) return { skipped: 'no-index' };

  if (!config.BSC.mnemonic || !config.BSC.hotWallet.address) {
    return { error: 'BSC master config missing' };
  }

  const usdtBalance = await tatumService.getBEP20Balance(
    addr, config.BSC.usdtContract
  );
  if (usdtBalance < config.BSC.minSweepUSDT) {
    return { skipped: 'usdt-dust', usdtBalance };
  }

  let bnbBalance = 0;
  try {
    const info = await tatumService.getAddressInfo('bsc', addr);
    bnbBalance = parseFloat(info?.balance || 0);
  } catch (_) {}

  if (bnbBalance < config.BSC.minGasBNB) {
    try {
      console.log(`⛽ Gas top-up → ${addr}`);
      await tatumService.sendBNB(
        config.BSC.hotWallet.privateKey,
        addr,
        config.BSC.gasTopUpBNB
      );
      await new Promise(r => setTimeout(r, 15000));
    } catch (e) {
      return { error: `gas top-up: ${e.message}` };
    }
  }

  let privKey;
  try {
    privKey = await tatumService.derivePrivateKey(
      'bsc', config.BSC.mnemonic, index
    );
  } catch (e) {
    return { error: `derive key: ${e.message}` };
  }

  try {
    const txId = await tatumService.sendBEP20(
      privKey,
      config.BSC.hotWallet.address,
      usdtBalance
    );
    console.log(`🔄 USDT swept: ${usdtBalance} | ${addr} → hot | ${txId}`);
    return { swept: usdtBalance, txId };
  } catch (e) {
    return { error: `send: ${e.message}` };
  }
}

exports.sweepAll = async () => {
  if (isSweeping) return { skipped: 'already-running' };
  isSweeping = true;

  const summary = {
    totalUsers: 0,
    ltcSwept: 0, ltcAmount: 0,
    usdtSwept: 0, usdtAmount: 0,
    errors: [],
  };

  try {
    const users = await User.find({
      $or: [
        { ltcAddress: { $ne: null } },
        { 'wallets.bscAddress': { $ne: null } },
      ],
    }).select('_id email ltcAddress wallets');

    summary.totalUsers = users.length;

    for (const user of users) {
      if (user.ltcAddress) {
        try {
          const r = await sweepLTC(user);
          if (r.swept) { summary.ltcSwept++; summary.ltcAmount += r.swept; }
          else if (r.error) summary.errors.push({ user: user._id, chain: 'ltc', error: r.error });
        } catch (e) {
          summary.errors.push({ user: user._id, chain: 'ltc', error: e.message });
        }
      }

      if (user.wallets?.bscAddress) {
        try {
          const r = await sweepBSC_USDT(user);
          if (r.swept) { summary.usdtSwept++; summary.usdtAmount += r.swept; }
          else if (r.error) summary.errors.push({ user: user._id, chain: 'bsc', error: r.error });
        } catch (e) {
          summary.errors.push({ user: user._id, chain: 'bsc', error: e.message });
        }
      }

      await new Promise(r => setTimeout(r, 300));
    }

    return summary;
  } finally {
    isSweeping = false;
  }
};

exports.previewAll = async () => {
  const users = await User.find({
    $or: [
      { ltcAddress: { $ne: null } },
      { 'wallets.bscAddress': { $ne: null } },
    ],
  }).select('_id email ltcAddress wallets');

  const results = [];
  for (const user of users) {
    const row = { userId: user._id, email: user.email, ltc: null, usdt: null };

    if (user.ltcAddress) {
      try {
        const info = await tatumService.getAddressInfo('ltc', user.ltcAddress);
        const bal = parseFloat(info?.balance || 0);
        row.ltc = {
          address: user.ltcAddress,
          balance: bal,
          sweepable: bal > config.LTC.minSweep,
        };
      } catch (e) { row.ltc = { error: e.message }; }
    }

    if (user.wallets?.bscAddress) {
      try {
        const bal = await tatumService.getBEP20Balance(
          user.wallets.bscAddress, config.BSC.usdtContract
        );
        row.usdt = {
          address: user.wallets.bscAddress,
          balance: bal,
          sweepable: bal >= config.BSC.minSweepUSDT,
        };
      } catch (e) { row.usdt = { error: e.message }; }
    }

    results.push(row);
  }
  return results;
};

exports.sweepLTC = sweepLTC;
exports.sweepBSC_USDT = sweepBSC_USDT;
