const express=require('express');
const router=express.Router();
const c=require('../controllers/transactionController');
const auth=require('../middleware/auth');

// All protected
router.use(auth);

router.post('/deposit/request', c.requestDeposit);
router.get('/resolve/:uid', c.resolveUid);
router.post('/send', c.sendMoney); // atomic transaction
router.post('/cashout/request', c.requestCashOut);
router.get('/my', c.myTransactions);

module.exports=router;
