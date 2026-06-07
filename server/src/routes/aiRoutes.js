import { Router } from 'express';
import { predictSales } from '../controllers/aiController.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.use(requireAuth);
router.post('/predict-sales', predictSales);

export default router;
