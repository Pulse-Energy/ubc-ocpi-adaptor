import { NextFunction, Request, Response, Router } from 'express';
import { OCPIPartnerCredentials } from '@prisma/client';
import { HttpResponse } from '../../types/responses';
import { logger } from '../../services/logger.service';
import { AppError } from '../../utils/errors';
import OCPIv221LocationsModuleOutgoingRequestService from '../../ocpi/modules/v2.2.1/emsp/locations/OCPIv221LocationsModuleOutgoingRequestService';
import OCPIv221TariffsModuleOutgoingRequestService from '../../ocpi/modules/v2.2.1/emsp/tariffs/OCPIv221TariffsModuleOutgoingRequestService';
import { databaseService } from '../../services/database.service';

const router = Router();

type AnyHttpResponse = HttpResponse<any, Record<string, string>>;

interface OCPIAuthedRequest extends Request {
    ocpiPartnerCredentials?: OCPIPartnerCredentials;
}

async function handleRequest(
    req: Request,
    res: Response,
    next: NextFunction,
    controller: (req: Request) => Promise<AnyHttpResponse>,
) {
    try {
        const response = await controller(req);
        
        // Set headers BEFORE sending the response
        if (response.headers) {
            Object.entries(response.headers).forEach(([key, value]) => {
                res.setHeader(key, value);
            });
        }
        
        // Send the response after headers are set
        res.status(response.httpStatus || 200).json(response.payload);
    }
    catch (error) {
        next(error);
    }
}

// Optional: simple auth/middleware hook if needed later
const ocpiApiAuth = async (req: Request, res: Response, next: NextFunction) => {
    // Add authentication/authorization here if desired
    const cpoAuthToken = req.headers.authorization?.substring('Token '.length);
    if (!cpoAuthToken) {
        res.status(401).json({
            status_code: 2001,
            status_message: 'Unauthorized',
            timestamp: new Date().toISOString(),
        });
        return;
    }

    const partnerCredentials = await databaseService.prisma.oCPIPartnerCredentials.findFirst({
        where: { cpo_auth_token: cpoAuthToken },
        include: { partner: true },
    });

    if (!partnerCredentials) {
        res.status(401).json({
            status_code: 2001,
            status_message: 'Unauthorized',
        });
        return;
    }

    (req as OCPIAuthedRequest).ocpiPartnerCredentials = partnerCredentials;

    next();
};
// Trigger a GET Locations towards CPO, store results in DB, and return OCPI payload
router.get(
    '/locations',
    ocpiApiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(
            req,
            res,
            next,
            (innerReq: Request) =>
                OCPIv221LocationsModuleOutgoingRequestService.sendGetLocations(
                    innerReq,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials?.cpo_auth_token ?? undefined,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials?.partner_id,
                ),
        ),
);

// Get a single location from DB; if missing, fetch from CPO, store, then return
router.get(
    '/locations/:location_id',
    ocpiApiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(
            req,
            res,
            next,
            (innerReq: Request) =>
                OCPIv221LocationsModuleOutgoingRequestService.sendGetLocation(
                    innerReq,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials?.cpo_auth_token ?? undefined,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials?.partner_id,
                ),
        ),
);


// Trigger a GET Tariffs towards CPO, store results in DB, and return OCPI payload (outgoing)
router.post(
    '/tariffs/fetch',
    ocpiApiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(
            req,
            res,
            next,
            (innerReq: Request) =>
                OCPIv221TariffsModuleOutgoingRequestService.sendGetTariffs(
                    innerReq,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials?.cpo_auth_token ?? undefined,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials?.partner_id,
                ),
        ),
);

// Get a single tariff from DB; if missing, fetch from CPO, store, then return (outgoing)
router.post(
    '/tariffs/:tariff_id/fetch',
    ocpiApiAuth,
    async (req: Request, res: Response, next: NextFunction) =>
        handleRequest(
            req,
            res,
            next,
            (innerReq: Request) =>
                OCPIv221TariffsModuleOutgoingRequestService.sendGetTariff(
                    innerReq,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials?.cpo_auth_token ?? undefined,
                    (req as OCPIAuthedRequest).ocpiPartnerCredentials?.partner_id,
                ),
        ),
);

// Error handling for this router
// eslint-disable-next-line @typescript-eslint/no-unused-vars
router.use((error: Error, req: Request, res: Response, _next: NextFunction): void => {
    logger.error('OCPI API (internal) error', error, {
        path: req.path,
        method: req.method,
    });

    if (error instanceof AppError) {
        res.status(error.statusCode).json({
            success: false,
            error: error.message,
        });
        return;
    }

    res.status(500).json({
        success: false,
        error: 'Internal server error',
    });
});

export default router;


