const express=require('express');
const router=express.Router();
const adminController=require('../controllers/adminController');
const auth=require('../middleware/auth');
const adminAuth=require('../middleware/adminAuth');

// Fixed: both auth + adminAuth
router.use(auth, adminAuth);

router.post('/approve-deposit', adminController.approveDeposit);
router.post('/approve-cashout', adminController.approveCashOut);
router.get('/pending', adminController.getPendingTransactions);

module.exports=router;
