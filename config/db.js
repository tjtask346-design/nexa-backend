const mongoose = require('mongoose');
const connectDB = async () => {
    if (!process.env.MONGO_URI) {
        console.error('❌ MONGO_URI missing');
        process.exit(1);
    }
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ DB Error: ${error.message}`);
        process.exit(1);
    }
};
module.exports = connectDB;
