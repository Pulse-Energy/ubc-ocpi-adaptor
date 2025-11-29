import { Router, Request, Response, NextFunction } from 'express';
import { locationsModule } from '../../ocpi/modules/locations';
import { tariffsModule } from '../../ocpi/modules/tariffs';
import { sessionsModule } from '../../ocpi/modules/sessions';
import { cdrsModule } from '../../ocpi/modules/cdrs';
import { tokensModule } from '../../ocpi/modules/tokens';
import { commandsModule } from '../../ocpi/modules/commands';
import { credentialsModule } from '../../ocpi/modules/credentials';
import { logger } from '../../services/logger.service';
import { AppError } from '../../utils/errors';

const router = Router();

// OCPI Authentication Middleware
const ocpiAuth = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Token ')) {
        return res.status(401).json({
            status_code: 2001,
            status_message: 'Unauthorized',
            timestamp: new Date().toISOString(),
        });
    }
    // In a real implementation, validate the token
    next();
};

// Error handling middleware
const errorHandler = (error: Error, req: Request, res: Response, next: NextFunction) => {
    logger.error('OCPI API error', error, {
        path: req.path,
        method: req.method,
    });

    if (error instanceof AppError) {
        return res.status(error.statusCode).json({
            status_code: error.statusCode === 400 ? 2000 : error.statusCode === 404 ? 2001 : 3000,
            status_message: error.message,
            timestamp: new Date().toISOString(),
        });
    }

    res.status(500).json({
        status_code: 3000,
        status_message: 'Internal server error',
        timestamp: new Date().toISOString(),
    });
};

// Credentials endpoint
router.post('/credentials', ocpiAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const registrationToken = req.headers.authorization?.replace('Token ', '') || '';
        const cpoUrl = req.body.url || '';

        const response = await credentialsModule.register(registrationToken, cpoUrl);
        res.json(response);
    }
    catch (error) {
        next(error);
    }
});

// Locations endpoints
router.put(
    '/locations/:location_id',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const locationId = req.params.location_id;
            const location = req.body;
            const cpoId = (req.headers['x-cpo-id'] as string) || 'unknown';

            const response = await locationsModule.putLocation(locationId, location, cpoId);
            res.json(response);
        }
        catch (error) {
            next(error);
        }
    }
);

router.get('/locations', ocpiAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
        const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;

        const locations = await locationsModule.getLocations(limit, offset);
        res.json({
            status_code: 1000,
            data: locations,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        next(error);
    }
});

router.get(
    '/locations/:location_id',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const locationId = req.params.location_id;
            const location = await locationsModule.getLocation(locationId);

            if (!location) {
                return res.status(404).json({
                    status_code: 2001,
                    status_message: 'Location not found',
                    timestamp: new Date().toISOString(),
                });
            }

            res.json({
                status_code: 1000,
                data: location,
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            next(error);
        }
    }
);

// Tariffs endpoints
router.put(
    '/tariffs/:tariff_id',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const tariffId = req.params.tariff_id;
            const tariff = req.body;
            const cpoId = (req.headers['x-cpo-id'] as string) || 'unknown';

            const response = await tariffsModule.putTariff(tariffId, tariff, cpoId);
            res.json(response);
        }
        catch (error) {
            next(error);
        }
    }
);

router.get('/tariffs', ocpiAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
        const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;

        const tariffs = await tariffsModule.getTariffs(limit, offset);
        res.json({
            status_code: 1000,
            data: tariffs,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        next(error);
    }
});

router.get(
    '/tariffs/:tariff_id',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const tariffId = req.params.tariff_id;
            const tariff = await tariffsModule.getTariff(tariffId);

            if (!tariff) {
                return res.status(404).json({
                    status_code: 2001,
                    status_message: 'Tariff not found',
                    timestamp: new Date().toISOString(),
                });
            }

            res.json({
                status_code: 1000,
                data: tariff,
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            next(error);
        }
    }
);

// Sessions endpoints
router.post('/sessions', ocpiAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const session = req.body;
        const response = await sessionsModule.createSession(session);
        res.json(response);
    }
    catch (error) {
        next(error);
    }
});

router.get('/sessions', ocpiAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
        const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;

        const sessions = await sessionsModule.getSessions(limit, offset);
        res.json({
            status_code: 1000,
            data: sessions,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        next(error);
    }
});

router.get(
    '/sessions/:session_id',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const sessionId = req.params.session_id;
            const session = await sessionsModule.getSession(sessionId);

            if (!session) {
                return res.status(404).json({
                    status_code: 2001,
                    status_message: 'Session not found',
                    timestamp: new Date().toISOString(),
                });
            }

            res.json({
                status_code: 1000,
                data: session,
                timestamp: new Date().toISOString(),
            });
        }
        catch (error) {
            next(error);
        }
    }
);

router.patch(
    '/sessions/:session_id',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const sessionId = req.params.session_id;
            const updates = req.body;
            const response = await sessionsModule.updateSession(sessionId, updates);
            res.json(response);
        }
        catch (error) {
            next(error);
        }
    }
);

// CDRs endpoints
router.post('/cdrs', ocpiAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const cdr = req.body;
        const response = await cdrsModule.createCDR(cdr);
        res.json(response);
    }
    catch (error) {
        next(error);
    }
});

router.get('/cdrs', ocpiAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
        const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;

        const cdrs = await cdrsModule.getCDRs(limit, offset);
        res.json({
            status_code: 1000,
            data: cdrs,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        next(error);
    }
});

router.get('/cdrs/:cdr_id', ocpiAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const cdrId = req.params.cdr_id;
        const cdr = await cdrsModule.getCDR(cdrId);

        if (!cdr) {
            return res.status(404).json({
                status_code: 2001,
                status_message: 'CDR not found',
                timestamp: new Date().toISOString(),
            });
        }

        res.json({
            status_code: 1000,
            data: cdr,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        next(error);
    }
});

// Tokens endpoints
router.get('/tokens', ocpiAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
        const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;

        const tokens = await tokensModule.getTokens(limit, offset);
        res.json({
            status_code: 1000,
            data: tokens,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        next(error);
    }
});

router.post(
    '/tokens/:token_uid/authorize',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const tokenUid = req.params.token_uid;
            const { location_id, evse_uid } = req.body;

            const response = await tokensModule.authorizeToken(tokenUid, location_id, evse_uid);
            res.json(response);
        }
        catch (error) {
            next(error);
        }
    }
);

// Commands endpoints
router.post(
    '/commands/:command',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const command = req.params.command as any;
            const { location_id, evse_uid, connector_id, reservation_id } = req.body;

            const response = await commandsModule.handleCommand(
                command,
                location_id,
                evse_uid,
                connector_id,
                reservation_id
            );
            res.json(response);
        }
        catch (error) {
            next(error);
        }
    }
);

router.use(errorHandler);

export default router;
