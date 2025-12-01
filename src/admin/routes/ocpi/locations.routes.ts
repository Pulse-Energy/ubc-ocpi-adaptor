import { NextFunction, Request, Response, Router } from 'express';
import AdminLocationsModule from '../../modules/AdminLocationsModule';
import { adminAuth } from '../utils/middlewares';
import handleRequest from '../utils/requestHandler';

const router = Router();


router.get('/', adminAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, AdminLocationsModule.getLocations)
);

router.post('/fetch', adminAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, AdminLocationsModule.fetchLocations)
);

router.post('/sync-to-cds', adminAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, AdminLocationsModule.syncToCDS)
);

router.get('/:location_id', adminAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, AdminLocationsModule.getLocation)
);

export default router;
