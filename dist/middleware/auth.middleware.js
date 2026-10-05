"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = authenticateToken;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const config_1 = require("../config/config");
const JWT_SECRET = config_1.env.JWT_SECRET;
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>
    if (!token) {
        return res.status(401).json({ error: 'Access token required' });
    }
    if (token.split('.').length !== 3) {
        return res.status(400).json({ error: 'Malformed token format' });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        if (decoded && typeof decoded === 'object' && decoded.sub) {
            const userId = String(decoded.sub);
            req.user = {
                id: userId,
                organization_id: decoded.org_id,
                organization_name: decoded.org_name,
            };
            next();
        }
        else {
            return res.status(403).json({ error: 'Invalid token payload' });
        }
    }
    catch (_err) {
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
}
