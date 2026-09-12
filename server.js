const express = require('express');
const mongoose = require('mongoose');

const app = express();
app.use(express.json());

// Global Error Handler
process.on('uncaughtException', (err) => console.error('Uncaught Exception:', err));
process.on('unhandledRejection', (err) => console.error('Unhandled Rejection:', err));

// MongoDB Connection
const MONGO_URI = process.env.MONGO_URI || 'YOUR_ACTUAL_MONGODB_URI_HERE';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('⚠️ MongoDB Connection Error:', err.message));

// Import Routes
const authRoutes = require('./routes/authRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const adminRoutes = require('./routes/adminRoutes');

// Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/transaction', transactionRoutes);
app.use('/api/admin', adminRoutes);

// Base Route
app.get('/', (req, res) => {
    res.send('🚀 Nexa Wallet API with Firebase Auth is Running Cleanly!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

