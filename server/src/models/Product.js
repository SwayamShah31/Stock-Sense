import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    shop: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, trim: true },
    category: { type: String, default: 'General' },
    description: { type: String, default: '' },
    imageUrl: { type: String, required: true, trim: true },
    quantity: { type: Number, default: 0 },
    minQuantity: { type: Number, default: 10 },
    costPrice: { type: Number, default: 0 },
    salePrice: { type: Number, required: true },
    supplierName: { type: String, default: '' },
    tags: [{ type: String }],
  },
  { timestamps: true },
);

export const Product = mongoose.model('Product', productSchema);
