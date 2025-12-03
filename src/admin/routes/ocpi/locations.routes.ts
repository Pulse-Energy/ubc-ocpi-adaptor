import { NextFunction, Request, Response, Router } from 'express';
import AdminLocationsModule from '../../modules/AdminLocationsModule';
import { adminAuth } from '../utils/middlewares';
import handleRequest from '../utils/requestHandler';
import OCPIv221LocationsModuleOutgoingRequestService from '../../../ocpi/modules/v2.2.1/emsp/locations/OCPIv221LocationsModuleOutgoingRequestService';

const router = Router();


router.get('/', adminAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, AdminLocationsModule.getLocations)
);

router.post('/locations', adminAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, OCPIv221LocationsModuleOutgoingRequestService.sendGetLocations)
);

router.post('/sync-to-cds', adminAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, AdminLocationsModule.syncToCDS)
);

router.get('/:location_id', adminAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, OCPIv221LocationsModuleOutgoingRequestService.sendGetLocation)
);

export default router;
