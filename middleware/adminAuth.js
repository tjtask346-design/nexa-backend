// Fixed admin check - must be after auth middleware
module.exports = (req,res,next)=>{
    if(req.user && req.user.role === 'admin') return next();
    return res.status(403).json({ 
      success:false, 
      message:'Admin only - Access denied' 
    });
};
