import { Router, Request, Response, NextFunction } from 'express';
import { extractTokenFromHeader, verifyToken } from '../../utils/auth';
import { TariffsClient } from '../../ocpi/client/tariffs-client';
import { tariffsModule } from '../../ocpi/modules/tariffs';
import { syncService } from '../../services/sync.service';
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

        const client = new TariffsClient(cpoId, cpoUrl);
        const tariffs = await client.fetchTariffs();

        // Store tariffs in database
        let stored = 0;
        for (const tariff of tariffs) {
            try {
                await tariffsModule.putTariff(tariff.id, tariff, cpoId);
                stored++;
            }
            catch (error) {
                logger.error('Error storing tariff', error, { tariffId: tariff.id });
            }
        }

        res.json({
            success: true,
            fetched: tariffs.length,
            stored,
            message: `Fetched ${tariffs.length} tariffs, stored ${stored}`,
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
            const { tariffId } = req.body;

            if (tariffId) {
                // Sync single tariff
                await syncService.syncTariffToCDS(tariffId);
                res.json({
                    success: true,
                    message: `Tariff ${tariffId} synced to CDS`,
                });
            }
            else {
                // Sync all tariffs
                const result = await syncService.syncAllTariffsToCDS();
                res.json({
                    success: true,
                    message: `Synced ${result.success} tariffs to CDS, ${result.failed} failed`,
                    ...result,
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

        const tariffs = await tariffsModule.getTariffs(limit, offset);

        res.json({
            success: true,
            data: tariffs,
            count: tariffs.length,
        });
    }
    catch (error) {
        next(error);
    }
});

router.get('/:tariff_id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
    try {
        const tariffId = req.params.tariff_id;
        const tariff = await tariffsModule.getTariff(tariffId);

        if (!tariff) {
            return res.status(404).json({
                success: false,
                message: 'Tariff not found',
            });
        }

        res.json({
            success: true,
            data: tariff,
        });
    }
    catch (error) {
        next(error);
    }
});

export default router;
