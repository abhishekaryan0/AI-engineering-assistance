import { AppError } from '../../src/utils/AppError';

describe('AppError', () => {
  it('should create an error with status code and operational flag', () => {
    const error = new AppError('Something went wrong', 400);

    expect(error.message).toBe('Something went wrong');
    expect(error.statusCode).toBe(400);
    expect(error.isOperational).toBe(true);
    expect(error instanceof AppError).toBe(true);
    expect(error instanceof Error).toBe(true);
  });

  it('should support non-operational errors', () => {
    const error = new AppError('Fatal', 500, false);
    expect(error.isOperational).toBe(false);
  });
});
