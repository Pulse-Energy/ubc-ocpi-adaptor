import { Router, Request, Response, NextFunction } from 'express';
import { generateToken, verifyToken, extractTokenFromHeader } from '../../utils/auth';
import { UnauthorizedError, ValidationError } from '../../utils/errors';
import { logger } from '../../services/logger.service';

const router = Router();

// Simple admin authentication (in production, use proper user management)
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { email, company } = req.body;

        if (!email) {
            throw new ValidationError('Email is required');
        }

        // In a real implementation, validate credentials against a user database
        // For now, accept any email with company domain validation
        const token = generateToken({ email, company });

        logger.info('Admin login successful', { email });

        res.json({
            token,
            user: { email, company },
        });
    }
    catch (error) {
        next(error);
    }
});

router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = extractTokenFromHeader(req.headers.authorization);
        const payload = verifyToken(token);

        res.json({
            email: payload.email,
            company: payload.company,
        });
    }
    catch (error) {
        next(error);
    }
});

export default router;
