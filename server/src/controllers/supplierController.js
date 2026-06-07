import { Supplier } from '../models/Supplier.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { HttpError } from '../utils/httpError.js';

export const listSuppliers = asyncHandler(async (req, res) => {
  const suppliers = await Supplier.find({ shop: req.user.id }).sort({ createdAt: -1 });
  res.json({ suppliers });
});

export const createSupplier = asyncHandler(async (req, res) => {
  const { name, phone, email, category, supplyRating } = req.body;

  if (!name) {
    throw new HttpError(400, 'Supplier name is required');
  }

  const supplier = await Supplier.create({
    shop: req.user.id,
    name,
    phone,
    email,
    category,
    supplyRating,
  });

  res.status(201).json({ supplier });
});
