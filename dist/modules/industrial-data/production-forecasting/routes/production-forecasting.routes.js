"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../../../middleware/auth.middleware");
const production_forecasting_controller_1 = require("../controllers/production-forecasting.controller");
const router = (0, express_1.Router)();
router.get('/well-list', auth_middleware_1.authenticateToken, production_forecasting_controller_1.ProductionForecastingController.getWellList);
router.get('/production-forecasting', auth_middleware_1.authenticateToken, production_forecasting_controller_1.ProductionForecastingController.getProductionForecasting);
exports.default = router;
