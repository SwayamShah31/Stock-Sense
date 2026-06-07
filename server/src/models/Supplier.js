import mongoose from 'mongoose';

const supplierSchema = new mongoose.Schema(
  {
    shop: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    category: { type: String, default: '' },
    supplyRating: { type: Number, default: 5 },
  },
  { timestamps: true },
);

export const Supplier = mongoose.model('Supplier', supplierSchema);
