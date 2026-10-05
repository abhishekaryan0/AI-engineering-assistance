/**
 * @file auth.middleware.test.ts
 * @description Comprehensive tests for authentication middleware
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { authenticateToken } from '../../src/middleware/auth.middleware';
import { env } from '../../src/config/config';

describe('Auth Middleware - authenticateToken', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockRequest = {
      headers: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  describe('Successful Authentication', () => {
    it('should authenticate valid token and call next()', () => {
      // Arrange
      const userId = 'user123';
      const token = jwt.sign({ sub: userId }, env.JWT_SECRET);
      mockRequest.headers = { authorization: `Bearer ${token}` };

      // Act
      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect((mockRequest as any).user).toEqual({ id: userId });
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should handle numeric user IDs', () => {
      // Arrange
      const userId = 456;
      const token = jwt.sign({ sub: userId }, env.JWT_SECRET);
      mockRequest.headers = { authorization: `Bearer ${token}` };

      // Act
      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect((mockRequest as any).user.id).toBe('456');
    });
  });

  describe('Missing Token', () => {
    it('should return 401 when no Authorization header', () => {
      // Act
      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Access token required',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when Authorization header is empty', () => {
      // Arrange
      mockRequest.headers = { authorization: '' };

      // Act
      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });

    it('should return 401 when only Bearer keyword without token', () => {
      // Arrange
      mockRequest.headers = { authorization: 'Bearer ' };

      // Act
      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });
  });

  describe('Malformed Token Format', () => {
    it('should return 400 for token with incorrect segment count', () => {
      // Arrange
      mockRequest.headers = { authorization: 'Bearer invalid.token' };

      // Act
      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Malformed token format',
      });
    });

    it('should return 400 for single segment token', () => {
      // Arrange
      mockRequest.headers = { authorization: 'Bearer singletoken' };

      // Act
      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });
  });

  describe('Invalid or Expired Token', () => {
    it('should return 403 for expired token', () => {
      // Arrange
      const expiredToken = jwt.sign(
        { sub: 'user123' },
        env.JWT_SECRET,
        { expiresIn: '-1h' } // Expired 1 hour ago
      );
      mockRequest.headers = { authorization: `Bearer ${expiredToken}` };

      // Act
      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid or expired token',
      });
    });

    it('should return 403 for token signed with wrong secret', () => {
      // Arrange
      const token = jwt.sign({ sub: 'user123' }, 'wrong-secret');
      mockRequest.headers = { authorization: `Bearer ${token}` };

      // Act
      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid or expired token',
      });
    });

    it('should return 403 for completely invalid token', () => {
      // Arrange
      mockRequest.headers = { authorization: 'Bearer invalid.token.string' };

      // Act
      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });
  });

  describe('Invalid Token Payload', () => {
    it('should return 403 when token payload has no sub claim', () => {
      // Arrange
      const token = jwt.sign({ userId: 'user123' }, env.JWT_SECRET);
      mockRequest.headers = { authorization: `Bearer ${token}` };

      // Act
      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid token payload',
      });
    });

    it('should return 403 when token claims are not object type', () => {
      // Arrange
      // Manually create a JWT with non-object payload (theoretical test)
      const malformedToken = jwt.sign('string-payload', env.JWT_SECRET);
      mockRequest.headers = { authorization: `Bearer ${malformedToken}` };

      // Act
      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(403);
    });
  });

  describe('Authorization Header Variants', () => {
    it('should work with lowercase bearer prefix', () => {
      // Arrange
      const userId = 'user123';
      const token = jwt.sign({ sub: userId }, env.JWT_SECRET);
      mockRequest.headers = { authorization: `bearer ${token}` };

      // Act
      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert - The implementation splits by space, so case doesn't matter
      // Authorization: "bearer token" will work just like "Bearer token"
      expect(mockNext).toHaveBeenCalled();
      expect((mockRequest as any).user.id).toBe(userId);
    });
  });

  describe('Request Context', () => {
    it('should attach user to request object', () => {
      // Arrange
      const userId = 'user-abc-123';
      const token = jwt.sign({ sub: userId }, env.JWT_SECRET);
      mockRequest.headers = { authorization: `Bearer ${token}` };

      // Act
      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect((mockRequest as any).user).toBeDefined();
      expect((mockRequest as any).user.id).toBe(userId);
    });

    it('should preserve other request properties', () => {
      // Arrange
      const userId = 'user123';
      const token = jwt.sign({ sub: userId }, env.JWT_SECRET);
      mockRequest.headers = { authorization: `Bearer ${token}` };
      mockRequest.method = 'GET';
      mockRequest.url = '/api/test';

      // Act
      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockRequest.method).toBe('GET');
      expect(mockRequest.url).toBe('/api/test');
    });
  });

  describe('Edge Cases', () => {
    it('should handle token with special characters in user ID', () => {
      // Arrange
      const userId = 'user-123_abc@test';
      const token = jwt.sign({ sub: userId }, env.JWT_SECRET);
      mockRequest.headers = { authorization: `Bearer ${token}` };

      // Act
      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect((mockRequest as any).user.id).toBe(userId);
    });

    it('should reject empty sub claim', () => {
      // Arrange
      const token = jwt.sign({ sub: '' }, env.JWT_SECRET);
      mockRequest.headers = { authorization: `Bearer ${token}` };

      // Act
      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert - Empty string is falsy, so decoded.sub will fail the check
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid token payload',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle very long user ID', () => {
      // Arrange
      const userId = 'a'.repeat(500);
      const token = jwt.sign({ sub: userId }, env.JWT_SECRET);
      mockRequest.headers = { authorization: `Bearer ${token}` };

      // Act
      authenticateToken(mockRequest as Request, mockResponse as Response, mockNext);

      // Assert
      expect(mockNext).toHaveBeenCalled();
      expect((mockRequest as any).user.id.length).toBe(500);
    });
  });
});
