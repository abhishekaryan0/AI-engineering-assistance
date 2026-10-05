"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorMiddleware = void 0;
const AppError_1 = require("../utils/AppError");
const zod_1 = require("zod");
const logger_1 = require("../utils/logger");
const errorMiddleware = (error, req, res, _next) => {
    logger_1.logger.error(error.message);
    if (error instanceof AppError_1.AppError) {
        return res.status(error.statusCode).json({
            status: 'error',
            message: error.message,
        });
    }
    if (error instanceof zod_1.ZodError) {
        return res.status(400).json({
            status: 'error',
            message: 'Validation Error',
            details: error.issues,
        });
    }
    return res.status(500).json({
        status: 'error',
        message: 'Internal Server Error',
    });
};
exports.errorMiddleware = errorMiddleware;
