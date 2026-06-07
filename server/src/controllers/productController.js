import { Product } from '../models/Product.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';
import { createNotificationWithEmail } from '../services/notificationDelivery.js';

function generateProductCode(name) {
  const base = String(name || 'product')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 12);

  return `PRD-${base || 'ITEM'}-${Date.now().toString(36).toUpperCase()}`;
}

export const listProducts = asyncHandler(async (req, res) => {
  const products = req.user.role === 'customer'
    ? await Product.find({}).sort({ createdAt: -1 })
    : await Product.find({ shop: req.user.id }).sort({ createdAt: -1 });
  res.json({ products });
});

export const createProduct = asyncHandler(async (req, res) => {
  const { name, sku, category, description, imageUrl, quantity, minQuantity, costPrice, salePrice, supplierName, tags = [] } = req.body;

  if (!name || !description || !imageUrl || salePrice === undefined) {
    throw new HttpError(400, 'Name, description, image, and selling price are required');
  }

  const product = await Product.create({
    shop: req.user.id,
    name,
    sku: sku?.trim() || generateProductCode(name),
    category,
    description,
    imageUrl,
    quantity,
    minQuantity,
    costPrice,
    salePrice,
    supplierName,
    tags,
  });

  if (Number(product.quantity) <= Number(product.minQuantity)) {
    await createNotificationWithEmail({
      shopId: req.user.id,
      title: Number(product.quantity) <= 0 ? 'Out of stock alert' : 'Low stock alert',
      message: Number(product.quantity) <= 0
        ? `${product.name} is out of stock.`
        : `${product.name} is low on stock. Only ${product.quantity} units remain.`,
      type: Number(product.quantity) <= 0 ? 'danger' : 'warning',
    });
  }

  res.status(201).json({ product });
});

export const updateProduct = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, sku, category, description, imageUrl, quantity, minQuantity, costPrice, salePrice, supplierName, tags = [] } = req.body;

  if (!name || !description || !imageUrl || salePrice === undefined) {
    throw new HttpError(400, 'Name, description, image, and selling price are required');
  }

  const existingProduct = await Product.findOne({ _id: id, shop: req.user.id });

  const product = await Product.findOneAndUpdate(
    { _id: id, shop: req.user.id },
    {
      name,
      sku: sku?.trim() || existingProduct?.sku || generateProductCode(name),
      category,
      description,
      imageUrl,
      quantity,
      minQuantity,
      costPrice,
      salePrice,
      supplierName,
      tags,
    },
    { new: true },
  );

  if (!product) {
    throw new HttpError(404, 'Product not found');
  }

  if (Number(product.quantity) <= Number(product.minQuantity)) {
    await createNotificationWithEmail({
      shopId: req.user.id,
      title: Number(product.quantity) <= 0 ? 'Out of stock alert' : 'Low stock alert',
      message: Number(product.quantity) <= 0
        ? `${product.name} is out of stock.`
        : `${product.name} is low on stock. Only ${product.quantity} units remain.`,
      type: Number(product.quantity) <= 0 ? 'danger' : 'warning',
    });
  }

  res.json({ product });
});
