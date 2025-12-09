import { NextFunction, Request, Response, Router } from 'express';
import { logger } from '../services/logger.service';
import { HttpResponse } from '../types/responses';
import { AppError } from '../utils/errors';
import OCPIv221CredentialsModuleIncomingRequestService from './modules/v2.2.1/credentials/OCPIv221CredentialsModuleIncomingRequestService';
import OCPIv221LocationsModuleIncomingRequestService from './modules/v2.2.1/emsp/locations/OCPIv221LocationsModuleIncomingRequestService';
import OCPIv221TariffsModuleIncomingRequestService from './modules/v2.2.1/emsp/tariffs/OCPIv221TariffsModuleIncomingRequestService';
import OCPIv221TokensModuleIncomingRequestService from './modules/v2.2.1/emsp/tokens/OCPIv221TokensModuleIncomingRequestService';
import OCPIv221SessionsModuleIncomingRequestService from './modules/v2.2.1/emsp/sessions/OCPIv221SessionsModuleIncomingRequestService';
import OCPIv221CDRsModuleIncomingRequestService from './modules/v2.2.1/emsp/cdrs/OCPIv221CDRsModuleIncomingRequestService';
import OCPIv221CommandsModuleIncomingRequestService from './modules/v2.2.1/emsp/commands/OCPIv221CommandsModuleIncomingRequestService';
import VersionsModuleIncomingRequestService from './modules/v2.2.1/emsp/versions/VersionsModuleIncomingRequestService';
import { OCPIResponsePayload } from './schema/general/types/responses';
import Utils from '../utils/Utils';
import { OCPIPartnerCredentials } from '@prisma/client';

const router = Router();

// Extend Express Request locally to carry OCPI partner credentials
type OCPIAuthedRequest = Request & {
    ocpiPartnerCredentials?: OCPIPartnerCredentials;
};

// OCPI Authentication Middleware
const ocpiAuth = async (req: OCPIAuthedRequest, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Token ')) {
        res.status(401).json({
            status_code: 2001,
            status_message: 'Unauthorized',
            timestamp: new Date().toISOString(),
        });
        return;
    }

    const emspAuthToken = authHeader.substring('Token '.length);

    try {
        const partnerCredentials = await Utils.findPartnerCredentialsUsingEMSPAuthToken(emspAuthToken);

        if (!partnerCredentials) {
            res.status(401).json({
                status_code: 2001,
                status_message: 'Unauthorized',
                timestamp: new Date().toISOString(),
            });
            return;
        }

        // Attach credentials to request for downstream handlers
        req.ocpiPartnerCredentials = partnerCredentials;

        next();
    }
    catch (error) {
        logger.error('OCPI auth error', error as Error, {
            path: req.path,
            method: req.method,
        });
        res.status(500).json({
            status_code: 3000,
            status_message: 'Internal server error',
            timestamp: new Date().toISOString(),
        });
    }
};

// Error handling middleware
// Must have 4 parameters so Express treats it as an error handler,
// not as a regular middleware.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const errorHandler = (error: Error, req: Request, res: Response, _next: NextFunction): void => {
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

// OCPI Versions for this EMSP interface:
// Mounted at /ocpi
// - GET /ocpi/versions
// - GET /ocpi/2.2.1
router.get(
    '/versions',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(req, res, next, VersionsModuleIncomingRequestService.handleGetVersions),
);

// Version details for 2.2.1 – base URL of this EMSP interface
router.get(
    '/versions/2.2.1/details',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(req, res, next, VersionsModuleIncomingRequestService.handleGetVersionDetails),
);


// Credentials endpoints (per OCPI 2.2.1, EMSP receiver):
// Under /ocpi/2.2.1/credentials
router.post(
    '/2.2.1/credentials',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(
            req,
            res,
            next,
            (innerReq: Request) =>
                OCPIv221CredentialsModuleIncomingRequestService.handlePostCredentials(
                    innerReq,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials!,
                ),
        ),
);

router.get(
    '/2.2.1/credentials',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(
            req,
            res,
            next,
            (innerReq: Request) =>
                OCPIv221CredentialsModuleIncomingRequestService.handleGetCredentials(
                    innerReq,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials!,
                ),
        ),
);

router.put(
    '/2.2.1/credentials',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(
            req,
            res,
            next,
            (innerReq: Request) =>
                OCPIv221CredentialsModuleIncomingRequestService.handlePutCredentials(
                    innerReq,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials!,
                ),
        ),
);

router.patch(
    '/2.2.1/credentials',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(
            req,
            res,
            next,
            (innerReq: Request) =>
                OCPIv221CredentialsModuleIncomingRequestService.handlePatchCredentials(
                    innerReq,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials!,
                ),
        ),
);


// Tokens endpoints (per OCPI 2.2.1, EMSP receiver)
router.get(
    '/2.2.1/tokens',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(
            req,
            res,
            next,
            (innerReq: Request) =>
                OCPIv221TokensModuleIncomingRequestService.handleGetTokens(
                    innerReq,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials!,
                ),
        ),
);

router.get(
    '/2.2.1/tokens/:country_code/:party_id/:token_uid',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(
            req,
            res,
            next,
            (innerReq: Request) =>
                OCPIv221TokensModuleIncomingRequestService.handleGetToken(
                    innerReq,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials!,
                ),
        ),
);

router.put(
    '/2.2.1/tokens/:country_code/:party_id/:token_uid',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(
            req,
            res,
            next,
            (innerReq: Request) =>
                OCPIv221TokensModuleIncomingRequestService.handlePutToken(
                    innerReq,
                    (req as any).ocpiPartnerCredentials,
                ),
        ),
);

router.patch(
    '/2.2.1/tokens/:country_code/:party_id/:token_uid',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(
            req,
            res,
            next,
            (innerReq: Request) =>
                OCPIv221TokensModuleIncomingRequestService.handlePatchToken(
                    innerReq,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials!,
                ),
        ),
);

router.post(
    '/2.2.1/tokens/:country_code/:party_id/:token_uid/authorize',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(
            req,
            res,
            next,
            (innerReq: Request) =>
                OCPIv221TokensModuleIncomingRequestService.handlePostAuthorizeToken(
                    innerReq,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials!,
                ),
        ),
);

// Sessions endpoints (OCPI 2.2.1, EMSP receiver)
router.get(
    '/2.2.1/sessions',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(req, res, next, OCPIv221SessionsModuleIncomingRequestService.handleGetSessions),
);

router.get(
    '/2.2.1/sessions/:country_code/:party_id/:session_id',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(req, res, next, OCPIv221SessionsModuleIncomingRequestService.handleGetSession),
);

router.put(
    '/2.2.1/sessions/:country_code/:party_id/:session_id',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(req, res, next, OCPIv221SessionsModuleIncomingRequestService.handlePutSession),
);

router.patch(
    '/2.2.1/sessions/:country_code/:party_id/:session_id',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(req, res, next, OCPIv221SessionsModuleIncomingRequestService.handlePatchSession),
);

// CDRs endpoints (OCPI 2.2.1, EMSP receiver)
router.get(
    '/2.2.1/cdrs',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(req, res, next, OCPIv221CDRsModuleIncomingRequestService.handleGetCDRs),
);

router.get(
    '/2.2.1/cdrs/:cdr_id',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(req, res, next, OCPIv221CDRsModuleIncomingRequestService.handleGetCDR),
);

router.post(
    '/2.2.1/cdrs',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(req, res, next, OCPIv221CDRsModuleIncomingRequestService.handlePostCDR),
);

// Commands callback endpoint (response_url target)
router.post(
    '/2.2.1/commands/:command_type/:command_id',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(req, res, next, OCPIv221CommandsModuleIncomingRequestService.handlePostCommand),
);


// Locations endpoints (OCPI 2.2.1, EMSP receiver)
router.get(
    '/2.2.1/locations',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(
            req,
            res,
            next,
            (innerReq: Request) =>
                OCPIv221LocationsModuleIncomingRequestService.handleGetLocations(
                    innerReq,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials!,
                ),
        ),
);
router.put(
    '/2.2.1/locations/:location_id',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(
            req,
            res,
            next,
            (innerReq: Request) =>
                OCPIv221LocationsModuleIncomingRequestService.handlePutLocation(
                    innerReq,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials!,
                ),
        ),
);
router.patch(
    '/2.2.1/locations/:location_id',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(
            req,
            res,
            next,
            (innerReq: Request) =>
                OCPIv221LocationsModuleIncomingRequestService.handlePatchLocation(
                    innerReq,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials!,
                ),
        ),
);

// EVSE endpoints
router.get(
    '/2.2.1/locations/:location_id/evses/:evse_uid',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(
            req,
            res,
            next,
            (innerReq: Request) =>
                OCPIv221LocationsModuleIncomingRequestService.handleGetEVSE(
                    innerReq,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials!,
                ),
        ),
);
router.put(
    '/2.2.1/locations/:location_id/evses/:evse_uid',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(
            req,
            res,
            next,
            (innerReq: Request) =>
                OCPIv221LocationsModuleIncomingRequestService.handlePutEVSE(
                    innerReq,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials!,
                ),
        ),
);
router.patch(
    '/2.2.1/locations/:location_id/evses/:evse_uid',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(
            req,
            res,
            next,
            (innerReq: Request) =>
                OCPIv221LocationsModuleIncomingRequestService.handlePatchEVSE(
                    innerReq,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials!,
                ),
        ),
);

// Connector endpoints
router.get(
    '/2.2.1/locations/:location_id/evses/:evse_uid/connectors/:connector_id',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(
            req,
            res,
            next,
            (innerReq: Request) =>
                OCPIv221LocationsModuleIncomingRequestService.handleGetConnector(
                    innerReq,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials!,
                ),
        ),
);
router.put(
    '/2.2.1/locations/:location_id/evses/:evse_uid/connectors/:connector_id',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(
            req,
            res,
            next,
            (innerReq: Request) =>
                OCPIv221LocationsModuleIncomingRequestService.handlePutConnector(
                    innerReq,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials!,
                ),
        ),
);
router.patch(
    '/2.2.1/locations/:location_id/evses/:evse_uid/connectors/:connector_id',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(
            req,
            res,
            next,
            (innerReq: Request) =>
                OCPIv221LocationsModuleIncomingRequestService.handlePatchConnector(
                    innerReq,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials!,
                ),
        ),
);

// Tariffs endpoints (OCPI 2.2.1, EMSP receiver)
router.get(
    '/2.2.1/tariffs',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(
            req,
            res,
            next,
            (innerReq: Request) =>
                OCPIv221TariffsModuleIncomingRequestService.handleGetTariffs(
                    innerReq,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials!,
                ),
        ),
);
router.get(
    '/2.2.1/tariffs/:country_code/:party_id/:tariff_id',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(
            req,
            res,
            next,
            (innerReq: Request) =>
                OCPIv221TariffsModuleIncomingRequestService.handleGetTariff(
                    innerReq,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials!,
                ),
        ),
);
router.put(
    '/2.2.1/tariffs/:country_code/:party_id/:tariff_id',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(
            req,
            res,
            next,
            (innerReq: Request) =>
                OCPIv221TariffsModuleIncomingRequestService.handlePutTariff(
                    innerReq,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials!,
                ),
        ),
);

router.delete(
    '/2.2.1/tariffs/:country_code/:party_id/:tariff_id',
    ocpiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(
            req,
            res,
            next,
            (innerReq: Request) =>
                OCPIv221TariffsModuleIncomingRequestService.handleDeleteTariff(
                    innerReq,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials!,
                ),
        ),
);


router.use(errorHandler);

export default router;
