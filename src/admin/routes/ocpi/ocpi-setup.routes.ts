import { NextFunction, Request, Response, Router } from 'express';
import AdminOCPISetupModule from '../../modules/AdminOCPISetupModule';
import { adminAuth } from '../utils/middlewares';
import handleRequest from '../utils/requestHandler';

const router = Router();


router.post('/register', adminAuth, async (req: Request, res: Response, next: NextFunction) => 
    handleRequest(req, res, next, AdminOCPISetupModule.registerWithCPO)
);
router.get('/status', adminAuth, async (req: Request, res: Response, next: NextFunction) => {
    handleRequest(req, res, next, AdminOCPISetupModule.getRegistrationStatus)
});


export default router;
