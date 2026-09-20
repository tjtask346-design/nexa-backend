require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');

const app = express();

// Security
app.use(helmet());
app.use(cors({ 
  origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : '*', 
  credentials: true 
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiters
const limiter = rateLimit({ 
  windowMs: 15*60*1000, 
  max: 200, 
  message: { success: false, message: 'Too many requests' } 
});
app.use('/api/', limiter);

const authLimiter = rateLimit({ 
  windowMs: 15*60*1000, 
  max: 30, 
  message: { success: false, message: 'Too many auth attempts' } 
});
app.use('/api/auth/', authLimiter);

// DB
connectDB();

// Routes
const authRoutes = require('./routes/authRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const adminRoutes = require('./routes/adminRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/transaction', transactionRoutes);
app.use('/api/admin', adminRoutes);

// Health
app.get('/', (req,res)=> res.json({ 
  success: true, 
  message: '🚀 Nexa Wallet API (Email Only) Running', 
  version: '2.0.0',
  fixed: ['phone removed', 'atomic transactions', 'admin auth fixed']
}));
app.get('/health', (req,res)=> res.json({ status: 'ok' }));

// 404
app.use((req,res)=> res.status(404).json({ success: false, message: 'Route not found' }));

// Error
app.use((err,req,res,next)=>{ 
  console.error(err); 
  res.status(500).json({ success: false, message: err.message }); 
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log(`🚀 Server running on ${PORT}`));
