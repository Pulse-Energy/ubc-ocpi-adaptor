import { Router, Request, Response } from 'express';
import { databaseService } from '../../services/database.service';
import { cacheService } from '../../services/cache.service';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
    try {
        const dbHealth = await databaseService.healthCheck();
        const cacheHealth = await cacheService.exists('health-check');

        const health = {
            status: dbHealth ? 'healthy' : 'unhealthy',
            timestamp: new Date().toISOString(),
            services: {
                database: dbHealth ? 'up' : 'down',
                cache: cacheHealth ? 'up' : 'down',
            },
        };

        res.status(dbHealth ? 200 : 503).json(health);
    }
    catch (error) {
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

export default router;
