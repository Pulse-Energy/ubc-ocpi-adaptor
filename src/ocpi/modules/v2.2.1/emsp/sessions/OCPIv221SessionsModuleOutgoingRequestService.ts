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
        const baseUrl =
            await OCPIv221SessionsModuleOutgoingRequestService.getCpoSessionsBaseUrl(partnerId);

        const params = new globalThis.URLSearchParams();
        if (req.query.offset) params.append('offset', String(req.query.offset));
        if (req.query.limit) params.append('limit', String(req.query.limit));
        if (req.query.date_from) params.append('date_from', String(req.query.date_from));
        if (req.query.date_to) params.append('date_to', String(req.query.date_to));
        if (req.query.country_code) params.append('country_code', String(req.query.country_code));
        if (req.query.party_id) params.append('party_id', String(req.query.party_id));

        const url = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;

        const response = await OCPIOutgoingRequestService.sendGetRequest({
            url,
            headers: OCPIv221SessionsModuleOutgoingRequestService.getAuthHeaders(cpoAuthToken),
            partnerId,
            command: OCPILogCommand.SendGetSessionsReq,
        });

        const payload = response.data as OCPISessionsResponse;

        return {
            httpStatus: 200,
            payload,
        };
    }

    /**
     * GET /sessions/{country_code}/{party_id}/{session_id}
     */
    public static async sendGetSession(
        req: Request,
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<HttpResponse<OCPISessionResponse>> {
        const baseUrl =
            await OCPIv221SessionsModuleOutgoingRequestService.getCpoSessionsBaseUrl(partnerId);
        const { country_code, party_id, session_id } = req.params as {
            country_code: string;
            party_id: string;
            session_id: string;
        };

        const params = new globalThis.URLSearchParams();
        if (req.query.type) params.append('type', String(req.query.type));

        const path = `${baseUrl}/${country_code}/${party_id}/${session_id}`;
        const url = params.toString() ? `${path}?${params.toString()}` : path;

        const response = await OCPIOutgoingRequestService.sendGetRequest({
            url,
            headers: OCPIv221SessionsModuleOutgoingRequestService.getAuthHeaders(cpoAuthToken),
            partnerId,
            command: OCPILogCommand.SendGetSessionOneReq,
        });

        const payload = response.data as OCPISessionResponse;

        return {
            httpStatus: 200,
            payload,
        };
    }

    /**
     * PUT /sessions/{country_code}/{party_id}/{session_id}
     */
    public static async sendPutSession(
        req: Request,
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<HttpResponse<OCPISessionResponse>> {
        const baseUrl =
            await OCPIv221SessionsModuleOutgoingRequestService.getCpoSessionsBaseUrl(partnerId);
        const { country_code, party_id, session_id } = req.params as {
            country_code: string;
            party_id: string;
            session_id: string;
        };

        const payload = req.body as OCPISession;

        const path = `${baseUrl}/${country_code}/${party_id}/${session_id}`;

        const response = await OCPIOutgoingRequestService.sendPutRequest({
            url: path,
            headers: OCPIv221SessionsModuleOutgoingRequestService.getAuthHeaders(cpoAuthToken),
            data: payload,
            partnerId,
            command: OCPILogCommand.SendPutSessionReq,
        });

        const payloadOut = response as OCPIResponsePayload<OCPISession>;

        return {
            httpStatus: 200,
            payload: payloadOut,
        };
    }

    /**
     * PATCH /sessions/{country_code}/{party_id}/{session_id}
     */
    public static async sendPatchSession(
        req: Request,
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<HttpResponse<OCPISessionResponse>> {
        const baseUrl =
            await OCPIv221SessionsModuleOutgoingRequestService.getCpoSessionsBaseUrl(partnerId);
        const { country_code, party_id, session_id } = req.params as {
            country_code: string;
            party_id: string;
            session_id: string;
        };

        const patch = req.body as OCPIPatchSession;

        const path = `${baseUrl}/${country_code}/${party_id}/${session_id}`;

        const response = await OCPIOutgoingRequestService.sendPatchRequest({
            url: path,
            headers: OCPIv221SessionsModuleOutgoingRequestService.getAuthHeaders(cpoAuthToken),
            data: patch,
            partnerId,
            command: OCPILogCommand.SendPatchSessionReq,
        });

        const payloadOut = response as OCPIResponsePayload<OCPISession>;

        return {
            httpStatus: 200,
            payload: payloadOut,
        };
    }
}
