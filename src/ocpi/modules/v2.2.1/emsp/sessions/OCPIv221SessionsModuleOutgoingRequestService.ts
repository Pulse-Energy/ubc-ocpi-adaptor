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
    private static async getCpoSessionsBaseUrl(): Promise<string> {
        return Utils.getOcpiEndpoint('sessions', 'SENDER');
    }

    private static getAuthHeaders(): Record<string, string> {
        const token = process.env.OCPI_CPO_AUTH_TOKEN || '';
        return {
            Authorization: `Token ${token}`,
        };
    }

    /**
     * GET /sessions – list sessions from CPO.
     */
    public static async sendGetSessions(
        req: Request,
    ): Promise<HttpResponse<OCPISessionsResponse>> {
        const baseUrl = await OCPIv221SessionsModuleOutgoingRequestService.getCpoSessionsBaseUrl();

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
            headers: OCPIv221SessionsModuleOutgoingRequestService.getAuthHeaders(),
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
    ): Promise<HttpResponse<OCPISessionResponse>> {
        const baseUrl = await OCPIv221SessionsModuleOutgoingRequestService.getCpoSessionsBaseUrl();
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
            headers: OCPIv221SessionsModuleOutgoingRequestService.getAuthHeaders(),
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
    ): Promise<HttpResponse<OCPISessionResponse>> {
        const baseUrl = await OCPIv221SessionsModuleOutgoingRequestService.getCpoSessionsBaseUrl();
        const { country_code, party_id, session_id } = req.params as {
            country_code: string;
            party_id: string;
            session_id: string;
        };

        const payload = req.body as OCPISession;

        const path = `${baseUrl}/${country_code}/${party_id}/${session_id}`;

        const response = await OCPIOutgoingRequestService.sendPutRequest({
            url: path,
            headers: OCPIv221SessionsModuleOutgoingRequestService.getAuthHeaders(),
            data: payload,
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
    ): Promise<HttpResponse<OCPISessionResponse>> {
        const baseUrl = await OCPIv221SessionsModuleOutgoingRequestService.getCpoSessionsBaseUrl();
        const { country_code, party_id, session_id } = req.params as {
            country_code: string;
            party_id: string;
            session_id: string;
        };

        const patch = req.body as OCPIPatchSession;

        const path = `${baseUrl}/${country_code}/${party_id}/${session_id}`;

        const response = await OCPIOutgoingRequestService.sendPatchRequest({
            url: path,
            headers: OCPIv221SessionsModuleOutgoingRequestService.getAuthHeaders(),
            data: patch,
        });

        const payloadOut = response as OCPIResponsePayload<OCPISession>;

        return {
            httpStatus: 200,
            payload: payloadOut,
        };
    }
}
