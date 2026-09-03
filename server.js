require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const transferRoutes = require('./routes/transfer');

const app = express();

app.use(express.json());
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));

// DB Connection
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://admin:admin123@cluster0.mongodb.net/nexa_db?retryWrites=true&w=majority";
mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB Connected Successfully!'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// Root Health Check
app.get('/', (req, res) => {
    res.json({ success: true, message: "🚀 Nexa Backend Server is Active & Running!" });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/transfer', transferRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
