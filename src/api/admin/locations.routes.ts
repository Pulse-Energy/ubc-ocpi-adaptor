import { Router, Request, Response, NextFunction } from 'express';
import { extractTokenFromHeader, verifyToken } from '../../utils/auth';
import { LocationsClient } from '../../ocpi/client/locations-client';
import { locationsModule } from '../../ocpi/modules/locations';
import { syncService } from '../../services/sync.service';
import { databaseService } from '../../services/database.service';
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

router.post('/fetch', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { cpoId, cpoUrl } = req.body;

        if (!cpoId || !cpoUrl) {
            throw new ValidationError('CPO ID and CPO URL are required');
        }

        const client = new LocationsClient(cpoId, cpoUrl);
        const locations = await client.fetchLocations();

        // Store locations in database
        let stored = 0;
        for (const location of locations) {
            try {
                await locationsModule.putLocation(location.id, location, cpoId);
                stored++;
            }
            catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                logger.error('Error storing location', err, { locationId: location.id });
            }
        }

        res.json({
            success: true,
            fetched: locations.length,
            stored,
            message: `Fetched ${locations.length} locations, stored ${stored}`,
        });
    }
    catch (error) {
        next(error);
    }
});

router.post(
    '/sync-to-cds',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const { locationId } = req.body;

            if (locationId) {
                // Sync single location
                await syncService.syncLocationToCDS(locationId);
                res.json({
                    success: true,
                    message: `Location ${locationId} synced to CDS`,
                });
            }
            else {
                // Sync all locations
                const result = await syncService.syncAllLocationsToCDS();
                const { success: successCount, failed } = result;
                res.json({
                    success: true,
                    message: `Synced ${successCount} locations to CDS, ${failed} failed`,
                    successCount,
                    failed,
                });
            }
        }
        catch (error) {
            next(error);
        }
    }
);

router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
        const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;

        const locations = await locationsModule.getLocations(limit, offset);

        res.json({
            success: true,
            data: locations,
            count: locations.length,
        });
    }
    catch (error) {
        next(error);
    }
});

router.get(
    '/:location_id',
    requireAuth,
    async (req: Request, res: Response, next: NextFunction) => {
        try {
            const locationId = req.params.location_id;
            const location = await locationsModule.getLocation(locationId);

            if (!location) {
                return res.status(404).json({
                    success: false,
                    message: 'Location not found',
                });
            }

            res.json({
                success: true,
                data: location,
            });
        }
        catch (error) {
            next(error);
        }
    }
);

export default router;
