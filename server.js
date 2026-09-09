require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./db');

const authRoutes = require('./routes/auth');
const transferRoutes = require('./routes/transfer');
const transactionRoutes = require('./routes/transactionRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));

// Connect Database
connectDB();

// Root Endpoint Check
app.get('/', (req, res) => {
    res.json({ success: true, message: "🚀 Nexa Backend Server is Active & Running!" });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/transfer', transferRoutes);
app.use('/api/transaction', transactionRoutes);
app.use('/api/admin', adminRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

