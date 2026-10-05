import { Router } from 'express';
import { authenticateToken } from '../../../../middleware/auth.middleware';
import { AtRiskAssistantController } from '../controllers/at-risk.controller';

const router = Router();

router.post('/at-risk-assistant/:id', authenticateToken, AtRiskAssistantController.atRiskAssistant);
router.get('/at-risk-assets', authenticateToken, AtRiskAssistantController.getAtRiskAssets);

router.patch(
  '/at-risk-dismiss-acknowledge/:id/status',
  authenticateToken,
  AtRiskAssistantController.updateAlertStatus
);
router.post(
  '/at-risk-take-action/:id/work-items',
  authenticateToken,
  AtRiskAssistantController.createWorkItem
);

export default router;
