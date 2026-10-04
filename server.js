require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');

const app = express();

app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  message: { success: false, message: 'Too many requests' }
});
app.use('/api/', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  message: { success: false, message: 'Too many auth attempts' },
  skip: (req) => req.originalUrl === '/api/auth/me' || req.originalUrl.startsWith('/api/auth/me?')
});
app.use('/api/auth/', authLimiter);

connectDB();

const authRoutes = require('./routes/authRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const adminRoutes = require('./routes/adminRoutes');
const kycRoutes = require('./routes/kycRoutes');
const tatumRoutes = require('./routes/tatum');
const notificationRoutes = require('./routes/notificationRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/transaction', transactionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/kyc', kycRoutes);
app.use('/api/tatum', tatumRoutes);
app.use('/api/notifications', notificationRoutes);

app.get('/', (req,res)=> res.json({ success: true, message: '🚀 Nexa Wallet API Running', version: '2.3.0' }));
app.get('/health', (req,res)=> res.json({ status: 'ok' }));

app.use((req,res)=> res.status(404).json({ success: false, message: 'Route not found' }));
app.use((err,req,res,next)=>{ console.error(err); res.status(500).json({ success: false, message: err.message }); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', ()=> console.log(`🚀 Server running on ${PORT}`));
