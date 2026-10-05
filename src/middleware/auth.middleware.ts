import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/config';

const JWT_SECRET = env.JWT_SECRET;

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  if (token.split('.').length !== 3) {
    return res.status(400).json({ error: 'Malformed token format' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;

    if (decoded && typeof decoded === 'object' && decoded.sub) {
      const userId = String(decoded.sub);
      (
        req as Request & {
          user: { id: string; organization_id?: string; organization_name?: string };
        }
      ).user = {
        id: userId,
        organization_id: decoded.org_id,
        organization_name: decoded.org_name,
      };
      next();
    } else {
      return res.status(403).json({ error: 'Invalid token payload' });
    }
  } catch (_err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}
