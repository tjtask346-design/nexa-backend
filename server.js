const express = require('express');
const cors = require('cors');
require('dotenv').config();
const connectDB = require('./config/db');

// ডাটাবেজ কানেকশন শুরু
connectDB();

const app = express();

// প্রয়োজনীয় মিডলওয়্যার
app.use(cors());
app.use(express.json());

// মূল রুটসমূহ (API Routes)
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/transaction', require('./routes/transactionRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));

// সার্ভার স্ট্যাটাস চেক রুট
app.get('/', (req, res) => {
    res.json({ 
        success: true, 
        message: "🚀 Nexa Backend Server is Active & Running!" 
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
