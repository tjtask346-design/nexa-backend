const express = require('express');
const cors = require('cors');
require('dotenv').config();
const connectDB = require('./config/db');

connectDB();
const app = express();

app.use(cors());
app.use(express.json());

// রুটসমূহ
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/transaction', require('./routes/transactionRoutes'));

app.get('/', (req, res) => res.json({ success: true, message: "Nexa Server Active" }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

