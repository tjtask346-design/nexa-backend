// POST /api/wallet/create-deposit-address
// body: { userId, chain: 'bsc' }
router.post('/create-deposit-address', async (req, res) => {
  const wallet = await generateWallet(req.body.chain);
  const address = await generateAddress(req.body.chain, wallet.xpub, 0);
  // DB তে save করো: userId -> { chain, address, xpub, mnemonic (encrypt করে) }
  await subscribeDeposit(req.body.chain, address);
  res.json({ address });
});

// POST /api/tatum/webhook - Tatum এখানে hit করবে
router.post('/tatum/webhook', async (req, res) => {
  // req.body তে আসবে transaction details
  // confirmations >= 1 হলে balance add করো
  console.log('Deposit webhook:', req.body);
  // TODO: DB update
  res.sendStatus(200);
});

// POST /api/withdraw/onchain
router.post('/withdraw/onchain', async (req, res) => {
  const { to, amount, chain } = req.body;
  // balance check, fee check
  const txId = await sendBEP20(process.env.HOT_WALLET_PRIVATE_KEY, to, amount);
  res.json({ success: true, txId });
});
