import { NextFunction, Request, Response, Router } from 'express';
import { logger } from '../services/logger.service';
import { HttpResponse } from '../types/responses';
import { AppError } from '../utils/errors';
import { BecknAction } from './schema/v2.0.0/enums/BecknAction';

// Import action handlers
import SelectActionHandler from './actions/handlers/SelectActionHandler';
import ConfirmActionHandler from './actions/handlers/ConfirmActionHandler';
import UpdateActionHandler from './actions/handlers/UpdateActionHandler';
import OnStatusActionHandler from './actions/handlers/OnStatusActionHandler';
import TrackActionHandler from './actions/handlers/TrackActionHandler';
import CancelActionHandler from './actions/handlers/CancelActionHandler';
import RatingActionHandler from './actions/handlers/RatingActionHandler';
import SupportActionHandler from './actions/handlers/SupportActionHandler';
import InitActionHandler from './actions/handlers/InitActionHandler';
import OnixBppPreReqLogger from '../utils/OnixBppPreReqLogger';

const router = Router();

// UBC Authentication Middleware (if needed)
const ubcAuth = (_req: Request, _res: Response, next: NextFunction) => {
    // TODO: Implement UBC authentication if required
    // For now, allow all requests
    OnixBppPreReqLogger.logRequest(_req);
    next();
};

// Error handling middleware
const errorHandler = (error: Error, req: Request, res: Response, _next: NextFunction) => {
    logger.error('UBC API error', error, {
        path: req.path,
        method: req.method,
    });

    if (error instanceof AppError) {
        res.status(error.statusCode).json({
            error: {
                type: 'DOMAIN_ERROR',
                code: error.statusCode.toString(),
                message: error.message,
            },
        });
        return _next(error);
    }

    res.status(500).json({
        error: {
            type: 'INTERNAL_ERROR',
            code: '500',
            message: 'Internal server error',
        },
    });
};

async function handleRequest(req: Request, res: Response, next: NextFunction, controller: (req: Request) => Promise<HttpResponse<any>>) {
    try {
        const response = await controller(req);
        res.status(response.httpStatus || 200).json(response.payload);
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


// Register action handlers
// Each action is registered as a POST endpoint since Beckn actions are typically POST requests

router.post(`/${BecknAction.select}`, ubcAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, SelectActionHandler.handleBppSelectRequest)
);

router.post(`/${BecknAction.init}`, ubcAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, InitActionHandler.handleBppInitAction)
);

router.post(`/${BecknAction.confirm}`, ubcAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, ConfirmActionHandler.handleBppConfirmAction)
);

router.post(`/${BecknAction.update}`, ubcAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, UpdateActionHandler.handleBppUpdateAction)
);

router.post(`/${BecknAction.on_status}`, ubcAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, OnStatusActionHandler.handleBppOnStatusRequest)
);

router.post(`/${BecknAction.track}`, ubcAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, TrackActionHandler.handleTrack)
);

router.post(`/${BecknAction.cancel}`, ubcAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, CancelActionHandler.handleCancel)
);

router.post(`/${BecknAction.rating}`, ubcAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, RatingActionHandler.handleRating)
);

router.post(`/${BecknAction.support}`, ubcAuth, async (req: Request, res: Response, next: NextFunction) =>
    handleRequest(req, res, next, SupportActionHandler.handleSupport)
);


router.use(errorHandler);

export default router;

