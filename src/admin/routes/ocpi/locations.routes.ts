import { NextFunction, Request, Response, Router } from 'express';
import AdminLocationsModule from '../../modules/AdminLocationsModule';
import { adminAuth } from '../utils/middlewares';
import handleRequest from '../utils/requestHandler';

const router = Router();

router.get('/', adminAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, AdminLocationsModule.sendGetLocations)
);

router.get('/:location_id', adminAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, AdminLocationsModule.sendGetLocation)
);

export default router;
