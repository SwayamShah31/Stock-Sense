import { Router } from 'express';
import { createSupplier, listSuppliers } from '../controllers/supplierController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.get('/', listSuppliers);
router.post('/', createSupplier);

export default router;
