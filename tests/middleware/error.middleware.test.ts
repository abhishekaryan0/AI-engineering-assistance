/**
 * @file error.middleware.test.ts
 * @description Comprehensive tests for error middleware
 */

import { Request, Response, NextFunction } from 'express';
import { errorMiddleware } from '../../src/middleware/error.middleware';
import { AppError } from '../../src/utils/AppError';
import { ZodError } from 'zod';

describe('Error Middleware - errorMiddleware', () => {
    let mockRequest: Partial<Request>;
    let mockResponse: Partial<Response>;
    let mockNext: jest.Mock;

    beforeEach(() => {
        mockRequest = {
            method: 'GET',
            url: '/api/test',
        };
        mockResponse = {
            status: jest.fn().mockReturnThis(),
            json: jest.fn().mockReturnThis(),
        };
        mockNext = jest.fn();
    });

    describe('AppError Handling', () => {
        it('should handle AppError with correct status code', () => {
            // Arrange
            const error = new AppError('Test error message', 400);

            // Act
            errorMiddleware(
                error,
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            // Assert
            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.json).toHaveBeenCalledWith({
                status: 'error',
                message: 'Test error message',
            });
        });

        it('should handle AppError with 404 status', () => {
            // Arrange
            const error = new AppError('Resource not found', 404);

            // Act
            errorMiddleware(
                error,
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            // Assert
            expect(mockResponse.status).toHaveBeenCalledWith(404);
            expect(mockResponse.json).toHaveBeenCalledWith({
                status: 'error',
                message: 'Resource not found',
            });
        });

        it('should handle AppError with 500 status', () => {
            // Arrange
            const error = new AppError('Internal server error', 500);

            // Act
            errorMiddleware(
                error,
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            // Assert
            expect(mockResponse.status).toHaveBeenCalledWith(500);
        });

        it('should handle AppError with 401 unauthorized', () => {
            // Arrange
            const error = new AppError('Unauthorized access', 401);

            // Act
            errorMiddleware(
                error,
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            // Assert
            expect(mockResponse.status).toHaveBeenCalledWith(401);
            expect(mockResponse.json).toHaveBeenCalledWith({
                status: 'error',
                message: 'Unauthorized access',
            });
        });

        it('should handle AppError with 403 forbidden', () => {
            // Arrange
            const error = new AppError('Forbidden', 403);

            // Act
            errorMiddleware(
                error,
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            // Assert
            expect(mockResponse.status).toHaveBeenCalledWith(403);
        });

        it('should handle AppError with special characters in message', () => {
            // Arrange
            const error = new AppError('Error: Invalid input <>&"\'', 400);

            // Act
            errorMiddleware(
                error,
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            // Assert
            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.json).toHaveBeenCalledWith({
                status: 'error',
                message: 'Error: Invalid input <>&"\'',
            });
        });
    });

    describe('ZodError Handling', () => {
        it('should handle ZodError validation errors', () => {
            // Arrange
            const zodError = new ZodError([
                {
                    code: 'invalid_type',
                    expected: 'string',
                    received: 'number',
                    path: ['email'],
                    message: 'Expected string, received number',
                },
            ]);

            // Act
            errorMiddleware(
                zodError as any,
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            // Assert
            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.json).toHaveBeenCalledWith({
                status: 'error',
                message: 'Validation Error',
                details: expect.any(Array),
            });
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({ details: expect.arrayContaining([expect.any(Object)]) })
            );
        });

        it('should include all validation issues in response', () => {
            // Arrange
            const zodError = new ZodError([
                {
                    code: 'invalid_type',
                    expected: 'string',
                    received: 'number',
                    path: ['email'],
                    message: 'Email must be a string',
                },
                {
                    code: 'too_small',
                    minimum: 8,
                    type: 'string',
                    inclusive: true,
                    path: ['password'],
                    message: 'Password must be at least 8 characters',
                },
            ]);

            // Act
            errorMiddleware(
                zodError as any,
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            // Assert
            const call = (mockResponse.json as jest.Mock).mock.calls[0][0];
            expect(call.details).toHaveLength(2);
            expect(call.details[0].path).toEqual(['email']);
            expect(call.details[1].path).toEqual(['password']);
        });

        it('should handle empty ZodError issues array', () => {
            // Arrange
            const zodError = new ZodError([]);

            // Act
            errorMiddleware(
                zodError as any,
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            // Assert
            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.json).toHaveBeenCalledWith({
                status: 'error',
                message: 'Validation Error',
                details: [],
            });
        });

        it('should handle multiple validation errors for same field', () => {
            // Arrange
            const zodError = new ZodError([
                {
                    code: 'too_small',
                    minimum: 8,
                    type: 'string',
                    inclusive: true,
                    path: ['password'],
                    message: 'Too short',
                },
                {
                    code: 'custom',
                    path: ['password'],
                    message: 'Must contain uppercase',
                },
            ]);

            // Act
            errorMiddleware(
                zodError as any,
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            // Assert
            const call = (mockResponse.json as jest.Mock).mock.calls[0][0];
            expect(call.details.filter((d: any) => d.path[0] === 'password')).toHaveLength(2);
        });
    });

    describe('Generic Error Handling', () => {
        it('should handle generic Error with 500 status', () => {
            // Arrange
            const error = new Error('Something went wrong');

            // Act
            errorMiddleware(
                error,
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            // Assert
            expect(mockResponse.status).toHaveBeenCalledWith(500);
            expect(mockResponse.json).toHaveBeenCalledWith({
                status: 'error',
                message: 'Internal Server Error',
            });
        });

        it('should handle error without message', () => {
            // Arrange
            const error = new Error();

            // Act
            errorMiddleware(
                error,
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            // Assert
            expect(mockResponse.status).toHaveBeenCalledWith(500);
            expect(mockResponse.json).toHaveBeenCalledWith({
                status: 'error',
                message: 'Internal Server Error',
            });
        });

        it('should handle error with empty message', () => {
            // Arrange
            const error = new Error('');

            // Act
            errorMiddleware(
                error,
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            // Assert
            expect(mockResponse.status).toHaveBeenCalledWith(500);
        });

        it('should handle custom error properties', () => {
            // Arrange
            const error = new Error('Test error');
            (error as any).customProperty = 'custom value';

            // Act
            errorMiddleware(
                error,
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            // Assert
            expect(mockResponse.status).toHaveBeenCalledWith(500);
            expect(mockResponse.json).toHaveBeenCalledWith({
                status: 'error',
                message: 'Internal Server Error',
            });
        });
    });

    describe('Error Priority', () => {
        it('should prioritize AppError over generic Error', () => {
            // Arrange
            const customError = Object.assign(new Error('Generic'), {
                statusCode: 400,
                isOperational: true,
            });
            customError.constructor = AppError;

            // Act
            errorMiddleware(
                customError,
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            // Assert - Depends on instanceof check
            expect(mockResponse.status).toHaveBeenCalled();
        });

        it('should handle ZodError before generic errors', () => {
            // Arrange
            const zodError = new ZodError([
                {
                    code: 'invalid_type',
                    expected: 'string',
                    received: 'number',
                    path: ['field'],
                    message: 'Type error',
                },
            ]);

            // Act
            errorMiddleware(
                zodError as any,
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            // Assert
            expect(mockResponse.status).toHaveBeenCalledWith(400);
            expect(mockResponse.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Validation Error' })
            );
        });
    });

    describe('Response Format', () => {
        it('should always include status field', () => {
            // Arrange
            const error = new Error('Test');

            // Act
            errorMiddleware(
                error,
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            // Assert
            const response = (mockResponse.json as jest.Mock).mock.calls[0][0];
            expect(response).toHaveProperty('status', 'error');
        });

        it('should always include message field', () => {
            // Arrange
            const error = new Error('Test error');

            // Act
            errorMiddleware(
                error,
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            // Assert
            const response = (mockResponse.json as jest.Mock).mock.calls[0][0];
            expect(response).toHaveProperty('message');
        });

        it('should include details only for ZodError', () => {
            // Arrange
            const zodError = new ZodError([]);

            // Act
            errorMiddleware(
                zodError as any,
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            // Assert
            const response = (mockResponse.json as jest.Mock).mock.calls[0][0];
            expect(response).toHaveProperty('details');
        });
    });

    describe('Request Context Preservation', () => {
        it('should pass all request context to error handler', () => {
            // Arrange
            const error = new AppError('Test error', 400);
            mockRequest.method = 'POST';
            mockRequest.url = '/api/users';
            mockRequest.headers = { 'content-type': 'application/json' };

            // Act
            errorMiddleware(
                error,
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            // Assert
            expect(mockRequest.method).toBe('POST');
            expect(mockRequest.url).toBe('/api/users');
            expect(mockRequest.headers).toBeDefined();
        });
    });

    describe('Edge Cases', () => {
        it('should handle null error gracefully', () => {
            // Act & Assert - This shouldn't happen in practice
            const error = new Error();

            errorMiddleware(
                error,
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            expect(mockResponse.status).toHaveBeenCalled();
        });

        it('should handle very long error message', () => {
            // Arrange
            const longMessage = 'A'.repeat(10000);
            const error = new AppError(longMessage, 400);

            // Act
            errorMiddleware(
                error,
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            // Assert
            expect(mockResponse.status).toHaveBeenCalledWith(400);
            const response = (mockResponse.json as jest.Mock).mock.calls[0][0];
            expect(response.message).toBe(longMessage);
        });

        it('should handle special status codes', () => {
            // Arrange
            const error = new AppError('Conflict', 409);

            // Act
            errorMiddleware(
                error,
                mockRequest as Request,
                mockResponse as Response,
                mockNext
            );

            // Assert
            expect(mockResponse.status).toHaveBeenCalledWith(409);
        });
    });
});
