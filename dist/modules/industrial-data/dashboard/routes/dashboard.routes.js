"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_middleware_1 = require("../../../../middleware/auth.middleware");
const dashboard_controller_1 = require("../controllers/dashboard.controller");
const router = (0, express_1.Router)();
router.get('/dashboard', auth_middleware_1.authenticateToken, dashboard_controller_1.DashboardController.getDashboardData);
exports.default = router;
