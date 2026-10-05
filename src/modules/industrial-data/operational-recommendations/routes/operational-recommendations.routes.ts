import { Router } from 'express';
import { authenticateToken } from '../../../../middleware/auth.middleware';
import { OperationalRecommendationsController } from '../controllers/operational-recommendations.controller';

const router = Router();

router.get(
  '/operational-recommendations',
  authenticateToken,
  OperationalRecommendationsController.getAllSuggestions
);
router.post(
  '/operation-recommendations-assistant/:id',
  authenticateToken,
  OperationalRecommendationsController.askAssistant
);
router.patch(
  '/operational-recommendations/:id/status',
  authenticateToken,
  OperationalRecommendationsController.updateStatusAndReason
);
router.post(
  '/operational-take-action/:id/work-items',
  authenticateToken,
  OperationalRecommendationsController.createWorkItem
);

export default router;
