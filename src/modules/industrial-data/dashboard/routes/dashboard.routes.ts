import { Router } from 'express';
import { authenticateToken } from '../../../../middleware/auth.middleware';
import { DashboardController } from '../controllers/dashboard.controller';

const router = Router();

router.get('/dashboard', authenticateToken, DashboardController.getDashboardData);

export default router;
