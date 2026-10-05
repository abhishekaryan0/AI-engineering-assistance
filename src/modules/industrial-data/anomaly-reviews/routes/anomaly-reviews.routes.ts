import { Router } from 'express';
import { authenticateToken } from '../../../../middleware/auth.middleware';
import { AnomalyReviewController } from '../controllers/anomaly-reviews.controller';

const router = Router();

router.get('/get-anomaly-reviews', authenticateToken, AnomalyReviewController.getAnomalyReviews);
router.patch(
  '/anomaly-reviews/:id/status',
  authenticateToken,
  AnomalyReviewController.updateStatus
);
router.post('/anomaly-reviews/:id/action', authenticateToken, AnomalyReviewController.takeAction);
router.post(
  '/anomaly-reviews-assistant/:id',
  authenticateToken,
  AnomalyReviewController.askAssistant
);

export default router;
