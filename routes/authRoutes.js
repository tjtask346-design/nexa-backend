const express=require('express');
const router=express.Router();
const authController=require('../controllers/authController');
const auth=require('../middleware/auth');

// Email only routes - phone removed
router.post('/register-firebase', authController.registerWithFirebase);
router.post('/login-pin', authController.loginWithPin);
router.get('/me', auth, authController.getMe);

module.exports=router;
