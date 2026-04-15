const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  sender: {
    type: String,
    required: true,
  },
  receiverName: {
    type: String,
    required: true,
  },
  transferMethod: {
    type: String,
    enum: ['PSID', 'Phone No', 'Easy Paisa', 'Jazz Cash', 'NeoPay Internal'],
    required: true,
  },
  accountNumber: {
    type: String,
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  }
}, { timestamps: true });

module.exports = mongoose.model('Transaction', TransactionSchema);
