import { Product } from '../models/Product.js';
import { Order } from '../models/Order.js';
import { Transaction } from '../models/Transaction.js';
import { Notification } from '../models/Notification.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getSummary = asyncHandler(async (req, res) => {
  const [productsCount, ordersCount, transactions, lowStockProducts, notificationsCount] = await Promise.all([
    Product.countDocuments({ shop: req.user.id }),
    Order.countDocuments({ shop: req.user.id }),
    Transaction.find({ shop: req.user.id }).sort({ createdAt: -1 }).limit(10),
    Product.countDocuments({ shop: req.user.id, $expr: { $lte: ['$quantity', '$minQuantity'] } }),
    Notification.countDocuments({ shop: req.user.id, read: false }),
  ]);

  const revenue = transactions.reduce((sum, transaction) => sum + transaction.amount, 0);

  res.json({
    summary: {
      productsCount,
      ordersCount,
      revenue,
      lowStockProducts,
      notificationsCount,
    },
    recentTransactions: transactions,
  });
});
