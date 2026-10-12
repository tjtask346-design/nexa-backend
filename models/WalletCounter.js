// models/WalletCounter.js
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  _id: { type: String },   // 'ltc' | 'bsc'
  seq: { type: Number, default: 0 },
}, { timestamps: true });

schema.statics.next = async function (key) {
  const doc = await this.findByIdAndUpdate(
    key,
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return doc.seq;
};

module.exports = mongoose.model('WalletCounter', schema);
