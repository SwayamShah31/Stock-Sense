import { Order } from '../models/Order.js';
import { Product } from '../models/Product.js';
import { Transaction } from '../models/Transaction.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { createNotificationWithEmail } from '../services/notificationDelivery.js';

export const createOrder = asyncHandler(async (req, res) => {
  const { customerName, items = [], paymentStatus = 'paid', orderStatus = 'completed' } = req.body;

  if (!items.length) {
    throw new HttpError(400, 'Order items are required');
  }

  const normalizedItems = await Promise.all(
    items.map(async (item) => {
      const product = req.user.role === 'customer'
        ? await Product.findOne({ _id: item.productId })
        : await Product.findOne({ _id: item.productId, shop: req.user.id });
      if (!product) {
        throw new HttpError(404, `Product not found: ${item.productId}`);
      }

      const quantity = Number(item.quantity || 1);
      const availableQuantity = Number(product.quantity || 0);

      if (!Number.isFinite(quantity) || quantity < 1) {
        throw new HttpError(400, `Invalid quantity for ${product.name}`);
      }

      if (availableQuantity <= 0) {
        throw new HttpError(400, `${product.name} is out of stock`);
      }

      if (quantity > availableQuantity) {
        throw new HttpError(400, `${product.name} only has ${availableQuantity} units available`);
      }

      const price = Number(item.price ?? product.salePrice);

      product.quantity = Math.max(0, availableQuantity - quantity);
      await product.save();

      if (product.quantity <= product.minQuantity) {
        await createNotificationWithEmail({
          shopId: req.user.id,
          title: product.quantity <= 0 ? 'Out of stock alert' : 'Low stock alert',
          message: product.quantity <= 0
            ? `${product.name} is out of stock after the latest sale.`
            : `${product.name} is low on stock after the latest sale. ${product.quantity} units remain.`,
          type: product.quantity <= 0 ? 'danger' : 'warning',
        });
      }

      return {
        product: product._id,
        name: product.name,
        quantity,
        price,
      };
    }),
  );

  const totalAmount = normalizedItems.reduce((sum, item) => sum + item.quantity * item.price, 0);
  const orderShopId = req.user.role === 'customer' ? normalizedItems[0] && (await Product.findById(normalizedItems[0].product))?.shop : req.user.id;
  if (!orderShopId) {
    throw new HttpError(404, 'Unable to determine order shop');
  }

  const order = await Order.create({
    shop: orderShopId,
    customerName: req.user.role === 'customer' ? req.user.name : customerName,
    customerEmail: req.user.role === 'customer' ? req.user.email : '',
    items: normalizedItems,
    totalAmount,
    paymentStatus,
    orderStatus,
  });

  await Transaction.create({
    shop: orderShopId,
    order: order._id,
    amount: totalAmount,
    method: 'cash',
    type: 'sale',
  });

  await createNotificationWithEmail({
    shopId: orderShopId,
    title: 'New order received',
    message: `${(req.user.role === 'customer' ? req.user.name : customerName) || 'A customer'} placed an order worth ${totalAmount}.`,
    type: 'success',
  });

  res.status(201).json({ order });
});

export const cancelOrder = asyncHandler(async (req, res) => {
  const order = req.user.role === 'customer'
    ? await Order.findOne({ _id: req.params.id, customerEmail: req.user.email })
    : await Order.findOne({ _id: req.params.id, shop: req.user.id });

  if (!order) {
    throw new HttpError(404, 'Order not found');
  }

  if (order.orderStatus === 'cancelled') {
    throw new HttpError(400, 'Order is already cancelled');
  }

  for (const item of order.items || []) {
    if (!item.product) {
      continue;
    }

    await Product.updateOne(
      { _id: item.product },
      { $inc: { quantity: Number(item.quantity || 0) } },
    );
  }

  order.orderStatus = 'cancelled';
  order.paymentStatus = 'refunded';
  await order.save();

  await Transaction.create({
    shop: order.shop,
    order: order._id,
    amount: -Math.abs(order.totalAmount || 0),
    method: 'cash',
    type: 'refund',
  });

  await createNotificationWithEmail({
    shopId: order.shop,
    title: 'Order cancelled',
    message: `${order.customerName} cancelled order ${String(order._id).slice(-6)}. Stock has been restored.`,
    type: 'warning',
  });

  res.json({ order });
});

export const listOrders = asyncHandler(async (req, res) => {
  const orders = req.user.role === 'customer'
    ? await Order.find({ customerEmail: req.user.email }).sort({ createdAt: -1 })
    : await Order.find({ shop: req.user.id }).sort({ createdAt: -1 });
  res.json({ orders });
});
