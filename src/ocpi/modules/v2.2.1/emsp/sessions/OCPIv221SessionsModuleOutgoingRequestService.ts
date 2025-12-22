import { Request } from 'express';
import { HttpResponse } from '../../../../../types/responses';
import {
    OCPISessionResponse,
    OCPISessionsResponse,
} from '../../../../schema/modules/sessions/types/responses';
import { OCPISession, OCPIPatchSession } from '../../../../schema/modules/sessions/types';
import OCPIOutgoingRequestService from '../../../../services/OCPIOutgoingRequestService';
import Utils from '../../../../../utils/Utils';
import { OCPIResponsePayload } from '../../../../schema/general/types/responses';
import { OCPILogCommand } from '../../../../types';
import { logger } from '../../../../../services/logger.service';

/**
 * OCPI 2.2.1 – Sessions module (outgoing, EMSP → CPO).
 *
 * Uses the CPO Sessions "SENDER" endpoint from Utils.getAllEndpoints():
 *   - GET   /sessions
 *   - GET   /sessions/{country_code}/{party_id}/{session_id}
 *   - PUT   /sessions/{country_code}/{party_id}/{session_id}
 *   - PATCH /sessions/{country_code}/{party_id}/{session_id}
 */
export default class OCPIv221SessionsModuleOutgoingRequestService {
    private static async getCpoSessionsBaseUrl(partnerId?: string): Promise<string> {
        return Utils.getOcpiEndpoint('sessions', 'SENDER', partnerId);
    }

    private static getAuthHeaders(cpoAuthToken: string): Record<string, string> {
        if (!cpoAuthToken) {
            throw new Error('CPO auth token is required to send OCPI session request');
        }
        return {
            Authorization: `Token ${cpoAuthToken}`,
        };
    }

    /**
     * GET /sessions – list sessions from CPO.
     */
    public static async sendGetSessions(
        req: Request,
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<HttpResponse<OCPISessionsResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || `outgoing-${Date.now()}`;
        const logData = { action: 'sendGetSessions', partnerId };

        try {
            logger.debug(`🟡 [${reqId}] Starting sendGetSessions in OCPIv221SessionsModuleOutgoingRequestService`, { data: logData });

            logger.debug(`🟡 [${reqId}] Getting CPO sessions base URL in sendGetSessions`, { data: logData });
            const baseUrl =
                await OCPIv221SessionsModuleOutgoingRequestService.getCpoSessionsBaseUrl(partnerId);

            logger.debug(`🟡 [${reqId}] Building query parameters in sendGetSessions`, { 
                data: { ...logData, query: req.query } 
            });
            const params = new globalThis.URLSearchParams();
            if (req.query.offset) params.append('offset', String(req.query.offset));
            if (req.query.limit) params.append('limit', String(req.query.limit));
            if (req.query.date_from) params.append('date_from', String(req.query.date_from));
            if (req.query.date_to) params.append('date_to', String(req.query.date_to));
            if (req.query.country_code) params.append('country_code', String(req.query.country_code));
            if (req.query.party_id) params.append('party_id', String(req.query.party_id));

            const url = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;

            logger.debug(`🟡 [${reqId}] Sending GET request to CPO /sessions in sendGetSessions`, { 
                data: { ...logData, url } 
            });
            const response = await OCPIOutgoingRequestService.sendGetRequest({
                url,
                headers: OCPIv221SessionsModuleOutgoingRequestService.getAuthHeaders(cpoAuthToken),
                partnerId,
                command: OCPILogCommand.SendGetSessionsReq,
            });

            logger.debug(`🟢 [${reqId}] Received response from CPO /sessions in sendGetSessions`, { 
                data: { ...logData, hasData: !!response.data } 
            });
            const payload = response.data as OCPISessionsResponse;

            logger.debug(`🟢 [${reqId}] Returning sendGetSessions response`, { 
                data: { ...logData, payload } 
            });

            return {
                httpStatus: 200,
                payload,
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in sendGetSessions: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * GET /sessions/{country_code}/{party_id}/{session_id}
     */
    public static async sendGetSession(
        req: Request,
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<HttpResponse<OCPISessionResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || `outgoing-${Date.now()}`;
        const logData = { action: 'sendGetSession', partnerId };

        try {
            logger.debug(`🟡 [${reqId}] Starting sendGetSession in OCPIv221SessionsModuleOutgoingRequestService`, { data: logData });

            logger.debug(`🟡 [${reqId}] Getting CPO sessions base URL in sendGetSession`, { data: logData });
            const baseUrl =
                await OCPIv221SessionsModuleOutgoingRequestService.getCpoSessionsBaseUrl(partnerId);
            const { country_code, party_id, session_id } = req.params as {
                country_code: string;
                party_id: string;
                session_id: string;
            };

            logger.debug(`🟡 [${reqId}] Building query parameters in sendGetSession`, { 
                data: { ...logData, country_code, party_id, session_id, query: req.query } 
            });
            const params = new globalThis.URLSearchParams();
            if (req.query.type) params.append('type', String(req.query.type));

            const path = `${baseUrl}/${country_code}/${party_id}/${session_id}`;
            const url = params.toString() ? `${path}?${params.toString()}` : path;

            logger.debug(`🟡 [${reqId}] Sending GET request to CPO /sessions/:session_id in sendGetSession`, { 
                data: { ...logData, url } 
            });
            const response = await OCPIOutgoingRequestService.sendGetRequest({
                url,
                headers: OCPIv221SessionsModuleOutgoingRequestService.getAuthHeaders(cpoAuthToken),
                partnerId,
                command: OCPILogCommand.SendGetSessionOneReq,
            });

            logger.debug(`🟢 [${reqId}] Received response from CPO /sessions/:session_id in sendGetSession`, { 
                data: { ...logData, hasData: !!response.data } 
            });
            const payload = response.data as OCPISessionResponse;

            logger.debug(`🟢 [${reqId}] Returning sendGetSession response`, { 
                data: { ...logData, payload } 
            });

            return {
                httpStatus: 200,
                payload,
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in sendGetSession: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * PUT /sessions/{country_code}/{party_id}/{session_id}
     */
    public static async sendPutSession(
        req: Request,
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<HttpResponse<OCPISessionResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || `outgoing-${Date.now()}`;
        const logData = { action: 'sendPutSession', partnerId };

        try {
            logger.debug(`🟡 [${reqId}] Starting sendPutSession in OCPIv221SessionsModuleOutgoingRequestService`, { data: logData });

            logger.debug(`🟡 [${reqId}] Getting CPO sessions base URL in sendPutSession`, { data: logData });
            const baseUrl =
                await OCPIv221SessionsModuleOutgoingRequestService.getCpoSessionsBaseUrl(partnerId);
            const { country_code, party_id, session_id } = req.params as {
                country_code: string;
                party_id: string;
                session_id: string;
            };

            const payload = req.body as OCPISession;

            logger.debug(`🟡 [${reqId}] Parsing PUT session payload in sendPutSession`, { 
                data: { ...logData, country_code, party_id, session_id, payload } 
            });

            const path = `${baseUrl}/${country_code}/${party_id}/${session_id}`;

            logger.debug(`🟡 [${reqId}] Sending PUT request to CPO /sessions/:session_id in sendPutSession`, { 
                data: { ...logData, url: path } 
            });
            const response = await OCPIOutgoingRequestService.sendPutRequest({
                url: path,
                headers: OCPIv221SessionsModuleOutgoingRequestService.getAuthHeaders(cpoAuthToken),
                data: payload,
                partnerId,
                command: OCPILogCommand.SendPutSessionReq,
            });

            logger.debug(`🟢 [${reqId}] Received response from CPO /sessions/:session_id in sendPutSession`, { 
                data: { ...logData, hasData: !!response } 
            });
            const payloadOut = response as OCPIResponsePayload<OCPISession>;

            logger.debug(`🟢 [${reqId}] Returning sendPutSession response`, { 
                data: { ...logData, payload: payloadOut } 
            });

            return {
                httpStatus: 200,
                payload: payloadOut,
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in sendPutSession: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * PATCH /sessions/{country_code}/{party_id}/{session_id}
     */
    public static async sendPatchSession(
        req: Request,
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<HttpResponse<OCPISessionResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || `outgoing-${Date.now()}`;
        const logData = { action: 'sendPatchSession', partnerId };

        try {
            logger.debug(`🟡 [${reqId}] Starting sendPatchSession in OCPIv221SessionsModuleOutgoingRequestService`, { data: logData });

            logger.debug(`🟡 [${reqId}] Getting CPO sessions base URL in sendPatchSession`, { data: logData });
            const baseUrl =
                await OCPIv221SessionsModuleOutgoingRequestService.getCpoSessionsBaseUrl(partnerId);
            const { country_code, party_id, session_id } = req.params as {
                country_code: string;
                party_id: string;
                session_id: string;
            };

            const patch = req.body as OCPIPatchSession;

            logger.debug(`🟡 [${reqId}] Parsing PATCH session payload in sendPatchSession`, { 
                data: { ...logData, country_code, party_id, session_id, patch } 
            });

            const path = `${baseUrl}/${country_code}/${party_id}/${session_id}`;

            logger.debug(`🟡 [${reqId}] Sending PATCH request to CPO /sessions/:session_id in sendPatchSession`, { 
                data: { ...logData, url: path } 
            });
            const response = await OCPIOutgoingRequestService.sendPatchRequest({
                url: path,
                headers: OCPIv221SessionsModuleOutgoingRequestService.getAuthHeaders(cpoAuthToken),
                data: patch,
                partnerId,
                command: OCPILogCommand.SendPatchSessionReq,
            });

            logger.debug(`🟢 [${reqId}] Received response from CPO /sessions/:session_id in sendPatchSession`, { 
                data: { ...logData, hasData: !!response } 
            });
            const payloadOut = response as OCPIResponsePayload<OCPISession>;

            logger.debug(`🟢 [${reqId}] Returning sendPatchSession response`, { 
                data: { ...logData, payload: payloadOut } 
            });

            return {
                httpStatus: 200,
                payload: payloadOut,
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in sendPatchSession: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }
}
