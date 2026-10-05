"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ea_routes_1 = __importDefault(require("../modules/engineering-assistant/routes/ea.routes"));
const at_risk_routes_1 = __importDefault(require("../modules/industrial-data/at-risk/routes/at-risk.routes"));
const operational_recommendations_routes_1 = __importDefault(require("../modules/industrial-data/operational-recommendations/routes/operational-recommendations.routes"));
const anomaly_reviews_routes_1 = __importDefault(require("../modules/industrial-data/anomaly-reviews/routes/anomaly-reviews.routes"));
const dashboard_routes_1 = __importDefault(require("../modules/industrial-data/dashboard/routes/dashboard.routes"));
const router = (0, express_1.Router)();
// EA Module Routes (Chat & History)
router.use('/', ea_routes_1.default);
// Industrial Data Routes
router.use('/', at_risk_routes_1.default);
router.use('/', operational_recommendations_routes_1.default);
router.use('/', anomaly_reviews_routes_1.default);
router.use('/', dashboard_routes_1.default);
exports.default = router;
