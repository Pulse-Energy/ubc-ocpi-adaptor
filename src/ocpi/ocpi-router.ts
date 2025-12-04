import { NextFunction, Request, Response, Router } from 'express';
import { logger } from '../services/logger.service';
import { HttpResponse } from '../types/responses';
import { AppError } from '../utils/errors';
import OCPIv221CredentialsModuleIncomingRequestService from './modules/v2.2.1/credentials/OCPIv221CredentialsModuleIncomingRequestService';
import OCPIv221LocationsModuleIncomingRequestService from './modules/v2.2.1/emsp/locations/OCPIv221LocationsModuleIncomingRequestService';
import OCPIv221TariffsModuleIncomingRequestService from './modules/v2.2.1/emsp/tariffs/OCPIv221TariffsModuleIncomingRequestService';
import VersionsModuleIncomingRequestService from './modules/v2.2.1/emsp/versions/VersionsModuleIncomingRequestService';
import { OCPIResponsePayload } from './schema/general/types/responses';

const router = Router();

// OCPI Authentication Middleware
const ocpiAuth = (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Token ')) {
        res.status(401).json({
            status_code: 2001,
            status_message: 'Unauthorized',
            timestamp: new Date().toISOString(),
        });
        return;
    }
    // In a real implementation, validate the token
    next();
};

// Error handling middleware
const errorHandler = (error: Error, req: Request, res: Response): void => {
    logger.error('OCPI API error', error, {
        path: req.path,
        method: req.method,
    });

    if (error instanceof AppError) {
        res.status(error.statusCode).json({
            status_code: error.statusCode === 400 ? 2000 : error.statusCode === 404 ? 2001 : 3000,
            status_message: error.message,
            timestamp: new Date().toISOString(),
        });
        return;
    }

    res.status(500).json({
        status_code: 3000,
        status_message: 'Internal server error',
        timestamp: new Date().toISOString(),
    });
};

async function handleRequest<T>(
    req: Request,
    res: Response,
    next: NextFunction,
    controller: (req: Request) => Promise<HttpResponse<OCPIResponsePayload<T>>>,
) {
    try {
        const response = await controller(req);

        // Strip BigInt from payload so JSON.stringify does not fail
        const safePayload = JSON.parse(
            JSON.stringify(
                response.payload,
                (_key, value) => (typeof value === 'bigint' ? Number(value) : value),
            ),
        );

        res.status(response.httpStatus || 200).json(safePayload);
        if (response.headers) {
            Object.entries(response.headers).forEach(([key, value]) => {
                res.setHeader(key, value);
            });
        }
    }
    catch (error) {
        next(error);
    }
}

// versions
router.get('/versions', ocpiAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, VersionsModuleIncomingRequestService.handleGetVersions)
);

router.get(`/versions/:ocpi_version/details`, ocpiAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, VersionsModuleIncomingRequestService.handleGetVersionDetails)
);


// Credentials endpoint
router.post('/credentials', ocpiAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, OCPIv221CredentialsModuleIncomingRequestService.handleGetCredentials)
);


// locations endpoints
router.get('/locations', ocpiAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, OCPIv221LocationsModuleIncomingRequestService.handleGetLocations)
);
router.put('/locations/:location_id', ocpiAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, OCPIv221LocationsModuleIncomingRequestService.handlePutLocation)
);
router.patch('/locations/:location_id', ocpiAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, OCPIv221LocationsModuleIncomingRequestService.handlePatchLocation)
);

// EVSE endpoints
router.get('/locations/:location_id/evses/:evse_uid', ocpiAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, OCPIv221LocationsModuleIncomingRequestService.handleGetEVSE)
);
router.put('/locations/:location_id/evses/:evse_uid', ocpiAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, OCPIv221LocationsModuleIncomingRequestService.handlePutEVSE)
);
router.patch('/locations/:location_id/evses/:evse_uid', ocpiAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, OCPIv221LocationsModuleIncomingRequestService.handlePatchEVSE)
);

// Connector endpoints
router.get('/locations/:location_id/evses/:evse_uid/connectors/:connector_id', ocpiAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, OCPIv221LocationsModuleIncomingRequestService.handleGetConnector)
);
router.put('/locations/:location_id/evses/:evse_uid/connectors/:connector_id', ocpiAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, OCPIv221LocationsModuleIncomingRequestService.handlePutConnector)
);
router.patch('/locations/:location_id/evses/:evse_uid/connectors/:connector_id', ocpiAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, OCPIv221LocationsModuleIncomingRequestService.handlePatchConnector)
);


// tariffs endpoints - OCPI 2.2.1 compliant with country_code and party_id in path
// router.get('/tariffs', ocpiAuth, async (req: Request, res: Response, next: NextFunction) =>
//     handleRequest(req, res, next, OCPIv221TariffsModuleIncomingRequestService.handleGetTariffs)
// );
// router.get('/tariffs/:country_code/:party_id/:tariff_id', ocpiAuth, async (req: Request, res: Response, next: NextFunction) =>
//     handleRequest(req, res, next, OCPIv221TariffsModuleIncomingRequestService.handleGetTariff)
// );
// router.put('/tariffs/:country_code/:party_id/:tariff_id', ocpiAuth, async (req: Request, res: Response, next: NextFunction) =>
//     handleRequest(req, res, next, OCPIv221TariffsModuleIncomingRequestService.handlePutTariff)
// );
// Backward compatibility - support tariff_id only (less ideal but works)
// router.get('/tariffs/:tariff_id', ocpiAuth, async (req: Request, res: Response, next: NextFunction) =>
//     handleRequest(req, res, next, OCPIv221TariffsModuleIncomingRequestService.handleGetTariff)
// );
// router.put('/tariffs/:tariff_id', ocpiAuth, async (req: Request, res: Response, next: NextFunction) =>
//     handleRequest(req, res, next, OCPIv221TariffsModuleIncomingRequestService.handlePutTariff)
// );

router.use(errorHandler);

export default router;
