const User = require('../models/User');
const Kyc = require('../models/Kyc');
const tatumService = require('../services/tatumService');

exports.submitKyc = async (req, res) => {
  try {
    const { nidNumber, frontUrl, backUrl, selfieUrl } = req.body;
    if (!nidNumber || !frontUrl || !backUrl || !selfieUrl) {
      return res.status(400).json({ success: false, message: 'All KYC fields required' });
    }

    const existing = await Kyc.findOne({ user: req.user._id });

    // 🚫 Pending অবস্থায় নতুন submit বন্ধ
    if (existing && existing.status === 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Your KYC is already under review. Please wait for admin approval.'
      });
    }

    // 🚫 Approved অবস্থায় নতুন submit বন্ধ
    if (existing && existing.status === 'approved') {
      return res.status(400).json({
        success: false,
        message: 'Your KYC is already verified. No need to resubmit.'
      });
    }

    // ✅ শুধু rejected হলেই পুরনো ডিলিট করে নতুন তৈরি
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

    // ⚠️ শুধু pending অবস্থায় approve করা যাবে
    if (kyc.status !== 'pending') {
      return res.status(400).json({ success: false, message: `Cannot approve — current status: ${kyc.status}` });
    }

    const user = await User.findById(kyc.user);

    // BSC wallet
    if (!user.wallets.bscAddress) {
      const wallet = await tatumService.generateWallet('bsc');
      const index = Math.floor(Math.random() * 100000);
      const address = await tatumService.generateAddress('bsc', wallet.xpub, index);
      user.wallets.bscAddress = address;
      user.wallets.walletIndex = index;
      user.wallets.xpub = wallet.xpub;
      await user.save();
      try { await tatumService.subscribeDeposit('bsc', address); } catch (e) { console.log('BSC subscribe:', e.message); }
    }

    // LTC wallet
    if (!user.ltcAddress) {
      try {
        const ltcWallet = await tatumService.generateWallet('ltc');
        const ltcIndex = Math.floor(Math.random() * 100000);
        const ltcAddr = await tatumService.generateAddress('ltc', ltcWallet.xpub, ltcIndex);
        user.ltcAddress = ltcAddr;
        user.wallets.ltcXpub = ltcWallet.xpub;
        user.wallets.ltcWalletIndex = ltcIndex;
        await user.save();
        try { await tatumService.subscribeDeposit('ltc', ltcAddr); } catch (e) { console.log('LTC subscribe:', e.message); }
      } catch (e) {
        console.log('LTC wallet generation failed:', e.message);
      }
    }

    kyc.status = 'approved';
    kyc.adminNote = '';
    await kyc.save();

    user.kycStatus = 'verified';
    await user.save();

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
      return res.status(400).json({ success: false, message: `Cannot reject — current status: ${kyc.status}` });
    }

    kyc.status = 'rejected';
    kyc.adminNote = adminNote.trim();
    await kyc.save();

    await User.findByIdAndUpdate(kyc.user, { kycStatus: 'rejected' });

    res.json({ success: true, message: 'KYC rejected', reason: adminNote.trim() });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
