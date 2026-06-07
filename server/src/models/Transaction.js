import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    shop: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    amount: { type: Number, required: true },
    method: { type: String, default: 'cash' },
    type: { type: String, enum: ['sale', 'refund', 'expense'], default: 'sale' },
  },
  { timestamps: true },
);

export const Transaction = mongoose.model('Transaction', transactionSchema);
