import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    quantity: Number,
    price: Number,
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    shop: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    customerName: { type: String, default: 'Walk-in Customer' },
    customerEmail: { type: String, default: '' },
    items: [orderItemSchema],
    totalAmount: { type: Number, required: true },
    paymentStatus: { type: String, enum: ['paid', 'pending', 'refunded'], default: 'paid' },
    orderStatus: { type: String, enum: ['draft', 'confirmed', 'completed', 'cancelled'], default: 'completed' },
  },
  { timestamps: true },
);

export const Order = mongoose.model('Order', orderSchema);
