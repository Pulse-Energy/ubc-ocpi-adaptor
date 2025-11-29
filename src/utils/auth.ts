import jwt from 'jsonwebtoken';
import { appConfig } from '../config/app.config';
import { UnauthorizedError } from './errors';

export interface JWTPayload {
    email: string;
    company?: string;
    iat?: number;
    exp?: number;
}

export function generateToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, appConfig.jwtSecret, {
        expiresIn: appConfig.jwtExpiresIn,
    });
}

export function verifyToken(token: string): JWTPayload {
    try {
        const decoded = jwt.verify(token, appConfig.jwtSecret) as JWTPayload;
        return decoded;
    }
    catch (error) {
        throw new UnauthorizedError('Invalid or expired token');
    }
}

export function extractTokenFromHeader(authHeader?: string): string {
    if (!authHeader) {
        throw new UnauthorizedError('Authorization header is missing');
    }

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
        throw new UnauthorizedError('Invalid authorization header format');
    }

    return parts[1];
}
