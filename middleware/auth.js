const jwt = require('jsonwebtoken'); 
const User = require('../models/User');

module.exports = async (req,res,next)=>{
    try{
        const header = req.header('Authorization')||'';
        const token = header.startsWith('Bearer ')? header.replace('Bearer ','').trim(): null;
        if(!token) return res.status(401).json({ success:false, message:'টোকেন নেই - লগইন করুন' });
        
        const secret = process.env.JWT_SECRET;
        if(!secret) throw new Error('JWT_SECRET missing');

        const decoded = jwt.verify(token, secret);
        const user = await User.findById(decoded.id).select('-pin');
        if(!user) return res.status(401).json({ success:false, message:'User not found' });
        
        req.user = user; 
        next();
    }catch(e){ 
      return res.status(401).json({ success:false, message:'Invalid or expired token' }); 
    }
};
