// controllers/kycController.js
const User = require('../models/User');
const Kyc = require('../models/Kyc');
const tatumService = require('../services/tatumService');
const notificationService = require('../services/notificationService');
const WalletCounter = require('../models/WalletCounter');
const walletConfig = require('../config/wallets');

exports.submitKyc = async (req, res) => {
  try {
    const { nidNumber, frontUrl, backUrl, selfieUrl } = req.body;
    if (!nidNumber || !frontUrl || !backUrl || !selfieUrl) {
      return res.status(400).json({ success: false, message: 'All KYC fields required' });
    }

    const existing = await Kyc.findOne({ user: req.user._id });

    if (existing && existing.status === 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Your KYC is already under review. Please wait for admin approval.'
      });
    }

    if (existing && existing.status === 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Your KYC is already verified. No need to resubmit.'
      });
    }

    if (existing) await Kyc.deleteOne({ _id: existing._id });

    const kyc = await Kyc.create({
      user: req.user._id,
      nidNumber, frontUrl, backUrl, selfieUrl,
      status: 'pending'
    });

    await User.findByIdAndUpdate(req.user._id, {
      kycStatus: 'pending',
      kycDocs: { nidNumber, frontUrl, backUrl, selfieUrl }
    });

    try {
      await notificationService.notify(req.user._id, {
        title: 'KYC Submitted ✓',
        body: 'Your documents are under review. We\'ll notify you within 24–48 hours.',
        type: 'kyc',
        data: { screen: 'kyc' }
      });
    } catch (e) { console.log(e.message); }

    try {
      const submitter = await User.findById(req.user._id).select('email fullName accountNumber');
      await notificationService.notifyAllAdmins({
        title: '🆕 New KYC Submission',
        body: `${submitter?.email || 'A user'} submitted KYC for review.`,
        type: 'kyc',
        data: { screen: 'admin_kyc', userId: String(req.user._id) }
      });
    } catch (e) { console.log(e.message); }

    res.json({ success: true, message: 'KYC submitted', kyc });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getMyKyc = async (req, res) => {
  try {
    const kyc = await Kyc.findOne({ user: req.user._id });
    res.json({ success: true, kyc });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getPendingKyc = async (req, res) => {
  try {
    const list = await Kyc.find({ status: 'pending' })
      .populate('user', 'email fullName accountNumber')
      .sort({ createdAt: 1 });
    res.json({ success: true, count: list.length, kycs: list });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.approveKyc = async (req, res) => {
  try {
    const { kycId } = req.body;
    const kyc = await Kyc.findById(kycId);
    if (!kyc) return res.status(404).json({ success: false, message: 'KYC not found' });

    if (kyc.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot approve — current status: ${kyc.status}`
      });
    }

    const user = await User.findById(kyc.user);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // ═══════════════════════════════════════════════════════
    // BSC deposit address — derived from MASTER_XPUB_BSC
    // ═══════════════════════════════════════════════════════
    if (!user.wallets.bscAddress) {
      if (!walletConfig.BSC.xpub) {
        console.error('❌ MASTER_XPUB_BSC missing — cannot generate BSC address');
      } else {
        try {
          const index = await WalletCounter.next('bsc');
          const address = await tatumService.generateAddress('bsc', walletConfig.BSC.xpub, index);
          user.wallets.bscAddress = address;
          user.wallets.walletIndex = index;
          user.wallets.xpub = walletConfig.BSC.xpub;
          await user.save();
          try { await tatumService.subscribeDeposit('bsc', address); }
          catch (e) { console.log('BSC subscribe:', e.message); }
        } catch (e) {
          console.log('BSC wallet generation failed:', e.message);
        }
      }
    }

    // ═══════════════════════════════════════════════════════
    // LTC deposit address — derived from MASTER_XPUB_LTC
    // ═══════════════════════════════════════════════════════
    if (!user.ltcAddress) {
      if (!walletConfig.LTC.xpub) {
        console.error('❌ MASTER_XPUB_LTC missing — cannot generate LTC address');
      } else {
        try {
          const ltcIndex = await WalletCounter.next('ltc');
          const ltcAddr = await tatumService.generateAddress('ltc', walletConfig.LTC.xpub, ltcIndex);
          user.ltcAddress = ltcAddr;
          user.wallets.ltcXpub = walletConfig.LTC.xpub;
          user.wallets.ltcWalletIndex = ltcIndex;
          await user.save();
          try { await tatumService.subscribeDeposit('ltc', ltcAddr); }
          catch (e) { console.log('LTC subscribe:', e.message); }
        } catch (e) {
          console.log('LTC wallet generation failed:', e.message);
        }
      }
    }

    kyc.status = 'approved';
    kyc.adminNote = '';
    await kyc.save();

    user.kycStatus = 'verified';
    await user.save();

    try {
      await notificationService.notify(user._id, {
        title: 'KYC Approved 🎉',
        body: 'Your identity is verified. Deposit & withdrawal are now unlocked.',
        type: 'kyc',
        data: { screen: 'kyc' }
      });
    } catch (e) { console.log(e.message); }

    res.json({
      success: true,
      message: 'KYC approved',
      addresses: { bsc: user.wallets.bscAddress, ltc: user.ltcAddress }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.rejectKyc = async (req, res) => {
  try {
    const { kycId, adminNote } = req.body;
    if (!adminNote || !adminNote.trim()) {
      return res.status(400).json({ success: false, message: 'Rejection reason (adminNote) is required' });
    }

    const kyc = await Kyc.findById(kycId);
    if (!kyc) return res.status(404).json({ success: false, message: 'KYC not found' });

    if (kyc.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot reject — current status: ${kyc.status}`
      });
    }

    kyc.status = 'rejected';
    kyc.adminNote = adminNote.trim();
    await kyc.save();

    await User.findByIdAndUpdate(kyc.user, { kycStatus: 'rejected' });

    try {
      await notificationService.notify(kyc.user, {
        title: 'KYC Verification Failed',
        body: adminNote.trim(),
        type: 'kyc',
        data: { screen: 'kyc' }
      });
    } catch (e) { console.log(e.message); }

    res.json({ success: true, message: 'KYC rejected', reason: adminNote.trim() });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
