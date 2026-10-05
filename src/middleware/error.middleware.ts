import { Request, Response, NextFunction } from 'express';

import { AppError } from '../utils/AppError';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

export const errorMiddleware = (error: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error(error.message);

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      status: 'error',
      message: error.message,
    });
  }

  if (error instanceof ZodError) {
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
