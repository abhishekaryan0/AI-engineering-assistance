/**
 * @file AppError.test.ts
 * @description Comprehensive tests for AppError utility class
 */

import { AppError } from '../../src/utils/AppError';

describe('AppError Class', () => {
    describe('Constructor', () => {
        it('should create error with message and statusCode', () => {
            // Arrange & Act
            const error = new AppError('Test error', 400);

            // Assert
            expect(error).toBeInstanceOf(Error);
            expect(error).toBeInstanceOf(AppError);
            expect(error.message).toBe('Test error');
            expect(error.statusCode).toBe(400);
        });

        it('should set isOperational to true by default', () => {
            // Arrange & Act
            const error = new AppError('Test error', 500);

            // Assert
            expect(error.isOperational).toBe(true);
        });

        it('should allow isOperational to be set to false', () => {
            // Arrange & Act
            const error = new AppError('Critical error', 500, false);

            // Assert
            expect(error.isOperational).toBe(false);
        });

        it('should create error with different status codes', () => {
            // Arrange & Act
            const badRequest = new AppError('Bad request', 400);
            const unauthorized = new AppError('Unauthorized', 401);
            const forbidden = new AppError('Forbidden', 403);
            const notFound = new AppError('Not found', 404);
            const conflict = new AppError('Conflict', 409);
            const serverError = new AppError('Server error', 500);
            const serviceUnavailable = new AppError('Service unavailable', 503);

            // Assert
            expect(badRequest.statusCode).toBe(400);
            expect(unauthorized.statusCode).toBe(401);
            expect(forbidden.statusCode).toBe(403);
            expect(notFound.statusCode).toBe(404);
            expect(conflict.statusCode).toBe(409);
            expect(serverError.statusCode).toBe(500);
            expect(serviceUnavailable.statusCode).toBe(503);
        });
    });

    describe('Error Properties', () => {
        it('should have all required properties', () => {
            // Arrange & Act
            const error = new AppError('Test message', 404, true);

            // Assert
            expect(error).toHaveProperty('message', 'Test message');
            expect(error).toHaveProperty('statusCode', 404);
            expect(error).toHaveProperty('isOperational', true);
        });

        it('should have name property as Error', () => {
            // Arrange & Act
            const error = new AppError('Test error', 400);

            // Assert
            expect(error.name).toBe('Error');
        });

        it('should have defined statusCode and isOperational properties', () => {
            // Arrange & Act
            const error = new AppError('Test error', 400, true);

            // Assert
            expect(error.statusCode).toBe(400);
            expect(error.isOperational).toBe(true);
        });
    });

    describe('Error Messages', () => {
        it('should handle empty message', () => {
            // Arrange & Act
            const error = new AppError('', 400);

            // Assert
            expect(error.message).toBe('');
        });

        it('should handle very long message', () => {
            // Arrange
            const longMessage = 'A'.repeat(10000);

            // Act
            const error = new AppError(longMessage, 400);

            // Assert
            expect(error.message).toBe(longMessage);
            expect(error.message.length).toBe(10000);
        });

        it('should handle special characters in message', () => {
            // Arrange & Act
            const error = new AppError('Error: Invalid input <>&"\'\\n\\t', 400);

            // Assert
            expect(error.message).toContain('<');
            expect(error.message).toContain('>');
            expect(error.message).toContain('&');
            expect(error.message).toContain('"');
            expect(error.message).toContain("'");
        });

        it('should handle multiline message', () => {
            // Arrange
            const message = 'Line 1\nLine 2\nLine 3';

            // Act
            const error = new AppError(message, 400);

            // Assert
            expect(error.message).toBe(message);
            expect(error.message).toContain('\n');
        });

        it('should handle unicode characters', () => {
            // Arrange & Act
            const error = new AppError('Error: 错误 エラー Ошибка', 400);

            // Assert
            expect(error.message).toContain('错误');
            expect(error.message).toContain('エラー');
            expect(error.message).toContain('Ошибка');
        });

        it('should handle JSON in message', () => {
            // Arrange
            const jsonMessage = JSON.stringify({ error: 'Invalid input', field: 'email' });

            // Act
            const error = new AppError(jsonMessage, 400);

            // Assert
            expect(error.message).toContain('"error"');
            expect(error.message).toContain('"Invalid input"');
        });
    });

    describe('Inheritance and Prototypes', () => {
        it('should extend Error class', () => {
            // Arrange & Act
            const error = new AppError('Test error', 400);

            // Assert
            expect(error instanceof Error).toBe(true);
            expect(error instanceof AppError).toBe(true);
        });

        it('should have correct prototype chain', () => {
            // Arrange & Act
            const error = new AppError('Test error', 400);

            // Assert
            expect(Object.getPrototypeOf(error)).toEqual(AppError.prototype);
        });

        it('should have stack trace', () => {
            // Arrange & Act
            const error = new AppError('Test error', 400);

            // Assert
            expect(error.stack).toBeDefined();
            expect(error.stack).toContain('AppError');
        });

        it('should have proper toString representation', () => {
            // Arrange & Act
            const error = new AppError('Test error', 400);

            // Assert
            expect(error.toString()).toContain('Error');
            expect(error.toString()).toContain('Test error');
        });
    });

    describe('Edge Cases - Status Codes', () => {
        it('should handle 0 as status code', () => {
            // Arrange & Act
            const error = new AppError('Zero status', 0);

            // Assert
            expect(error.statusCode).toBe(0);
        });

        it('should handle negative status code', () => {
            // Arrange & Act
            const error = new AppError('Negative status', -1);

            // Assert
            expect(error.statusCode).toBe(-1);
        });

        it('should handle very large status code', () => {
            // Arrange & Act
            const error = new AppError('Large status', 999);

            // Assert
            expect(error.statusCode).toBe(999);
        });

        it('should handle HTTP status codes correctly', () => {
            // Arrange & Act
            const error1 = new AppError('Bad request', 400);
            const error2 = new AppError('Unauthorized', 401);
            const error3 = new AppError('Server error', 500);

            // Assert
            expect(error1.statusCode).toBe(400);
            expect(error2.statusCode).toBe(401);
            expect(error3.statusCode).toBe(500);
        });
    });

    describe('Operational vs Non-Operational Errors', () => {
        it('should distinguish operational errors', () => {
            // Arrange & Act
            const operationalError = new AppError('Validation failed', 400, true);

            // Assert
            expect(operationalError.isOperational).toBe(true);
        });

        it('should distinguish non-operational errors', () => {
            // Arrange & Act
            const nonOperationalError = new AppError('Programming error', 500, false);

            // Assert
            expect(nonOperationalError.isOperational).toBe(false);
        });

        it('should default to operational', () => {
            // Arrange & Act
            const error = new AppError('Default operational', 400);

            // Assert
            expect(error.isOperational).toBe(true);
        });

        it('should handle all boolean values for isOperational', () => {
            // Arrange & Act
            const error1 = new AppError('Error 1', 400, true);
            const error2 = new AppError('Error 2', 400, false);

            // Assert
            expect(error1.isOperational).toBe(true);
            expect(error2.isOperational).toBe(false);
        });
    });

    describe('Multiple Instances', () => {
        it('should create independent instances', () => {
            // Arrange & Act
            const error1 = new AppError('Error 1', 400);
            const error2 = new AppError('Error 2', 500);

            // Assert
            expect(error1).not.toBe(error2);
            expect(error1.message).not.toBe(error2.message);
            expect(error1.statusCode).not.toBe(error2.statusCode);
        });

        it('should not share state between instances', () => {
            // Arrange
            const error1 = new AppError('Error 1', 400, true);
            const error2 = new AppError('Error 2', 500, false);

            // Act
            const message1 = error1.message;
            const status1 = error1.statusCode;
            const operational1 = error1.isOperational;

            // Assert
            expect(message1).toBe('Error 1');
            expect(status1).toBe(400);
            expect(operational1).toBe(true);
            expect(error2.isOperational).toBe(false);
        });
    });

    describe('Type Checking', () => {
        it('should be instanceof AppError', () => {
            // Arrange & Act
            const error = new AppError('Test', 400);

            // Assert
            expect(error instanceof AppError).toBe(true);
        });

        it('should be instanceof Error', () => {
            // Arrange & Act
            const error = new AppError('Test', 400);

            // Assert
            expect(error instanceof Error).toBe(true);
        });

        it('should have correct constructor', () => {
            // Arrange & Act
            const error = new AppError('Test', 400);

            // Assert
            expect(error.constructor.name).toBe('AppError');
        });

        it('should work with try-catch', () => {
            // Arrange & Act
            let caughtError: AppError | null = null;
            try {
                throw new AppError('Test error', 400);
            } catch (error: unknown) {
                if (error instanceof AppError) {
                    caughtError = error;
                }
            }

            // Assert
            expect(caughtError).not.toBeNull();
            expect(caughtError?.message).toBe('Test error');
            expect(caughtError?.statusCode).toBe(400);
        });

        it('should work with Promise rejection', async () => {
            // Arrange
            const error = new AppError('Promise error', 500);

            // Act & Assert
            await expect(Promise.reject(error)).rejects.toThrow('Promise error');
        });
    });

    describe('Common Usage Patterns', () => {
        it('should work in success/error handling', () => {
            // Arrange
            const validateEmail = (email: string) => {
                if (!email.includes('@')) {
                    throw new AppError('Invalid email', 400);
                }
                return true;
            };

            // Act & Assert
            expect(() => validateEmail('invalid')).toThrow(AppError);
            expect(() => validateEmail('invalid')).toThrow('Invalid email');
            expect(validateEmail('test@example.com')).toBe(true);
        });

        it('should work in async function error handling', async () => {
            // Arrange
            const asyncFunction = async () => {
                throw new AppError('Async error', 500);
            };

            // Act & Assert
            await expect(asyncFunction()).rejects.toThrow(AppError);
            await expect(asyncFunction()).rejects.toThrow('Async error');
        });

        it('should work in middleware chain', () => {
            // Arrange
            const errors: AppError[] = [];
            const middleware = (error: unknown) => {
                if (error instanceof AppError) {
                    errors.push(error);
                }
            };

            // Act
            const error = new AppError('Middleware error', 400);
            middleware(error);

            // Assert
            expect(errors).toContain(error);
            expect(errors[0].statusCode).toBe(400);
        });

        it('should work with Promise chain', async () => {
            // Arrange
            const error = new AppError('Chain error', 400);

            // Act & Assert
            await expect(
                Promise.resolve()
                    .then(() => {
                        throw error;
                    })
            ).rejects.toThrow(AppError);
        });
    });
});
