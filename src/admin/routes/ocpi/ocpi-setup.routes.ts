import { NextFunction, Request, Response, Router } from 'express';
import AdminOCPISetupModule from '../../modules/AdminOCPISetupModule';
import { adminAuth } from '../utils/middlewares';
import handleRequest from '../utils/requestHandler';

const router = Router();


// Sync versions from CPO and store in DB for a given partner
router.post('/versions', adminAuth, (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, AdminOCPISetupModule.getCpoVersions)
);

// Sync version details (endpoints) from CPO and store in DB for a given partner+version
router.post('/versions/details', adminAuth, (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, AdminOCPISetupModule.getCpoVersionDetails)
);

// Directly POST raw OCPI Credentials payload to a CPO
router.post('/credentials', adminAuth, (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, AdminOCPISetupModule.sendPostCredentials)
);

// GET CPO view of credentials for a given partner
router.get('/credentials', adminAuth, (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, AdminOCPISetupModule.getCpoCredentials)
);

router.get('/status', adminAuth, (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, AdminOCPISetupModule.getRegistrationStatus)
);


export default router;
