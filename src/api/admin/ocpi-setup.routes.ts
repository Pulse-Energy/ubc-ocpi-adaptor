import { Router, Request, Response, NextFunction } from 'express';
import { ocpiRegistrationService } from '../../services/ocpi-registration.service';
import { extractTokenFromHeader, verifyToken } from '../../utils/auth';
import { ValidationError } from '../../utils/errors';
import { logger } from '../../services/logger.service';

const router = Router();

// Auth middleware
const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    try {
        const token = extractTokenFromHeader(req.headers.authorization);
        verifyToken(token);
        next();
    }
    catch (error) {
        next(error);
    }
};

router.post('/register', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { registrationToken, cpoUrl } = req.body;

        if (!registrationToken || !cpoUrl) {
            throw new ValidationError('Registration token and CPO URL are required');
        }

        await ocpiRegistrationService.registerWithCPO(registrationToken, cpoUrl);

        res.json({
            success: true,
            message: 'OCPI registration successful',
        });
    }
    catch (error) {
        next(error);
    }
});

router.get('/status', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { cpoId } = req.query;

        if (!cpoId || typeof cpoId !== 'string') {
            throw new ValidationError('CPO ID is required');
        }

        const status = await ocpiRegistrationService.getRegistrationStatus(cpoId);

        res.json(status);
    }
    catch (error) {
        next(error);
    }
});

export default router;
