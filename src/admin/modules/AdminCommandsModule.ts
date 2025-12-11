import { Request } from 'express';
import { HttpResponse } from '../../types/responses';
import { AdminResponsePayload } from '../types/responses';
import { ValidationError } from '../../utils/errors';
import CommandsService, {
    StartChargingCommandParams,
    StopChargingCommandParams,
} from '../../services/CommandsService';

/**
 * Admin Commands module
 *
 * Responsibility:
 *  - Accept high-level command parameters (location, EVSE, connector, etc.) from admin APIs
 *  - Delegate to CommandsService which:
 *      - Resolves target CPO partner via partner_id
 *      - Fetches CPO auth token from OCPIPartnerCredentials
 *      - Generates OCPI Start/Stop command payloads
 *      - Calls the OCPI Commands outgoing service (EMSP → CPO)
 */
export default class AdminCommandsModule {

    /**
     * Admin API: Start charging session
     *
     * POST /api/admin/commands/start
     *
     * Body:
     *  - partner_id: string (required)
     *  - location_id: string (required)
     *  - evse_uid: string (required)
     *  - connector_id: string (required)
     *  - transaction_id: string (required) – used as authorization_reference
     */
    public static async startCharging(
        req: Request,
    ): Promise<HttpResponse<AdminResponsePayload<any>>> {
        const {
            partner_id: partnerId,
            location_id: locationId,
            evse_uid: evseUid,
            connector_id: connectorId,
            transaction_id: transactionId,
        } = req.body as {
            partner_id?: string;
            location_id?: string;
            evse_uid?: string;
            connector_id?: string;
            transaction_id?: string;
        };

        if (!partnerId) {
            throw new ValidationError('partner_id is required');
        }
        if (!locationId) {
            throw new ValidationError('location_id is required');
        }
        if (!evseUid) {
            throw new ValidationError('evse_uid is required');
        }
        if (!connectorId) {
            throw new ValidationError('connector_id is required');
        }
        if (!transactionId) {
            throw new ValidationError('transaction_id is required');
        }

        const params: StartChargingCommandParams = {
            partnerId,
            locationId,
            evseUid,
            connectorId,
            transactionId,
        };

        const cpoResponse = await CommandsService.startSession(params);

        return {
            httpStatus: cpoResponse.httpStatus,
            headers: cpoResponse.headers,
            payload: {
                data: cpoResponse.payload,
            },
        };
    }

    /**
     * Admin API: Stop charging session
     *
     * POST /api/admin/commands/stop
     *
     * Body:
     *  - partner_id: string (required)
     *  - session_id: string (required) – CPO-generated OCPI Session.id
     */
    public static async stopCharging(
        req: Request,
    ): Promise<HttpResponse<AdminResponsePayload<any>>> {
        const {
            partner_id: partnerId,
            session_id: sessionId,
        } = req.body as {
            partner_id?: string;
            session_id?: string;
        };

        if (!partnerId) {
            throw new ValidationError('partner_id is required');
        }
        if (!sessionId) {
            throw new ValidationError('session_id is required');
        }

        const params: StopChargingCommandParams = {
            partnerId,
            sessionId,
        };

        const cpoResponse = await CommandsService.stopSession(params);

        return {
            httpStatus: cpoResponse.httpStatus,
            headers: cpoResponse.headers,
            payload: {
                data: cpoResponse.payload,
            },
        };
    }
}


