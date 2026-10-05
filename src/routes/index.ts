import { Router } from 'express';
import eaRoutes from '../modules/engineering-assistant/routes/ea.routes';

import atRiskRoutes from '../modules/industrial-data/at-risk/routes/at-risk.routes';
import operationalRoutes from '../modules/industrial-data/operational-recommendations/routes/operational-recommendations.routes';
import anomalyRoutes from '../modules/industrial-data/anomaly-reviews/routes/anomaly-reviews.routes';
import dashboardRoutes from '../modules/industrial-data/dashboard/routes/dashboard.routes';

const router = Router();

// EA Module Routes (Chat & History)
router.use('/', eaRoutes);

// Industrial Data Routes
router.use('/', atRiskRoutes);
router.use('/', operationalRoutes);
router.use('/', anomalyRoutes);
router.use('/', dashboardRoutes);

export default router;
