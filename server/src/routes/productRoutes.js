import { Router } from 'express';
import { createProduct, listProducts, updateProduct } from '../controllers/productController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.get('/', listProducts);
router.post('/', createProduct);
router.patch('/:id', updateProduct);

export default router;
