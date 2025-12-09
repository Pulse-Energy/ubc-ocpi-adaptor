import { Request } from 'express';
import { HttpResponse } from '../../../../../types/responses';
import {
    OCPITokenResponse,
    OCPITokensResponse,
    OCPIAuthorizationInfoResponse,
} from '../../../../schema/modules/tokens/types/responses';
import { OCPIToken, OCPILocationReferences } from '../../../../schema/modules/tokens/types';
import OCPIOutgoingRequestService from '../../../../services/OCPIOutgoingRequestService';
import Utils from '../../../../../utils/Utils';
import { OCPIResponsePayload } from '../../../../schema/general/types/responses';

/**
 * OCPI 2.2.1 – Tokens module (outgoing, EMSP → CPO).
 *
 * Uses the CPO Tokens "RECEIVER" endpoint from Utils.getAllEndpoints():
 *   - GET    /tokens
 *   - GET    /tokens/{country_code}/{party_id}/{token_uid}
 *   - PUT    /tokens/{country_code}/{party_id}/{token_uid}
 *   - PATCH  /tokens/{country_code}/{party_id}/{token_uid}
 *   - POST   /tokens/{country_code}/{party_id}/{token_uid}/authorize
 */
export default class OCPIv221TokensModuleOutgoingRequestService {
    private static async getCpoTokensBaseUrl(): Promise<string> {
        return Utils.getOcpiEndpoint('tokens', 'RECEIVER');
    }

    private static getAuthHeaders(): Record<string, string> {
        // Re‑use same auth token as other outgoing OCPI calls
        // This should be the token the CPO expects from this EMSP.
        const token = process.env.OCPI_CPO_AUTH_TOKEN || '';
        return {
            Authorization: `Token ${token}`,
        };
    }

    /**
     * GET /tokens – list tokens from CPO.
     */
    public static async sendGetTokens(
        req: Request,
    ): Promise<HttpResponse<OCPITokensResponse>> {
        const baseUrl = await OCPIv221TokensModuleOutgoingRequestService.getCpoTokensBaseUrl();

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
            headers: OCPIv221TokensModuleOutgoingRequestService.getAuthHeaders(),
        });

        const payload = response.data as OCPITokensResponse;

        return {
            httpStatus: 200,
            payload,
        };
    }

    /**
     * GET /tokens/{country_code}/{party_id}/{token_uid}
     */
    public static async sendGetToken(
        req: Request,
    ): Promise<HttpResponse<OCPITokenResponse>> {
        const baseUrl = await OCPIv221TokensModuleOutgoingRequestService.getCpoTokensBaseUrl();
        const { country_code, party_id, token_uid } = req.params as {
            country_code: string;
            party_id: string;
            token_uid: string;
        };

        const params = new globalThis.URLSearchParams();
        if (req.query.type) params.append('type', String(req.query.type));

        const path = `${baseUrl}/${country_code}/${party_id}/${token_uid}`;
        const url = params.toString() ? `${path}?${params.toString()}` : path;

        const response = await OCPIOutgoingRequestService.sendGetRequest({
            url,
            headers: OCPIv221TokensModuleOutgoingRequestService.getAuthHeaders(),
        });

        const payload = response.data as OCPITokenResponse;

        return {
            httpStatus: 200,
            payload,
        };
    }

    /**
     * PUT /tokens/{country_code}/{party_id}/{token_uid}
     */
    public static async sendPutToken(
        req: Request,
    ): Promise<HttpResponse<OCPITokenResponse>> {
        const baseUrl = await OCPIv221TokensModuleOutgoingRequestService.getCpoTokensBaseUrl();
        const { country_code, party_id, token_uid } = req.params as {
            country_code: string;
            party_id: string;
            token_uid: string;
        };
        const token = req.body as OCPIToken;

        const params = new globalThis.URLSearchParams();
        if (req.query.type) params.append('type', String(req.query.type));

        const path = `${baseUrl}/${country_code}/${party_id}/${token_uid}`;
        const url = params.toString() ? `${path}?${params.toString()}` : path;

        const response = await OCPIOutgoingRequestService.sendPutRequest({
            url,
            headers: OCPIv221TokensModuleOutgoingRequestService.getAuthHeaders(),
            data: token,
        });

        const payload = response as OCPIResponsePayload<OCPIToken>;

        return {
            httpStatus: 200,
            payload,
        };
    }

    /**
     * Direct helper for admin or internal callers:
     * Sends a PUT /tokens/{country_code}/{party_id}/{token_uid} with the given OCPIToken.
     */
    public static async sendPutTokenDirect(
        token: OCPIToken,
    ): Promise<HttpResponse<OCPIResponsePayload<OCPIToken>>> {
        const baseUrl = await OCPIv221TokensModuleOutgoingRequestService.getCpoTokensBaseUrl();
        const path = `${baseUrl}/${token.country_code}/${token.party_id}/${token.uid}`;

        const response = await OCPIOutgoingRequestService.sendPutRequest({
            url: path,
            headers: OCPIv221TokensModuleOutgoingRequestService.getAuthHeaders(),
            data: token,
        });

        const payload = response as OCPIResponsePayload<OCPIToken>;

        return {
            httpStatus: 200,
            payload,
        };
    }

    /**
     * PATCH /tokens/{country_code}/{party_id}/{token_uid}
     */
    public static async sendPatchToken(
        req: Request,
    ): Promise<HttpResponse<OCPITokenResponse>> {
        const baseUrl = await OCPIv221TokensModuleOutgoingRequestService.getCpoTokensBaseUrl();
        const { country_code, party_id, token_uid } = req.params as {
            country_code: string;
            party_id: string;
            token_uid: string;
        };
        const patch = req.body as Partial<OCPIToken>;

        const params = new globalThis.URLSearchParams();
        if (req.query.type) params.append('type', String(req.query.type));

        const path = `${baseUrl}/${country_code}/${party_id}/${token_uid}`;
        const url = params.toString() ? `${path}?${params.toString()}` : path;

        const response = await OCPIOutgoingRequestService.sendPatchRequest({
            url,
            headers: OCPIv221TokensModuleOutgoingRequestService.getAuthHeaders(),
            data: patch,
        });

        const payload = response as OCPIResponsePayload<OCPIToken>;

        return {
            httpStatus: 200,
            payload,
        };
    }

    /**
     * POST /tokens/{country_code}/{party_id}/{token_uid}/authorize
     */
    public static async sendPostAuthorizeToken(
        req: Request,
    ): Promise<HttpResponse<OCPIAuthorizationInfoResponse>> {
        const baseUrl = await OCPIv221TokensModuleOutgoingRequestService.getCpoTokensBaseUrl();
        const { country_code, party_id, token_uid } = req.params as {
            country_code: string;
            party_id: string;
            token_uid: string;
        };
        const location = req.body as OCPILocationReferences | undefined;

        const params = new globalThis.URLSearchParams();
        if (req.query.type) params.append('type', String(req.query.type));

        const path = `${baseUrl}/${country_code}/${party_id}/${token_uid}/authorize`;
        const url = params.toString() ? `${path}?${params.toString()}` : path;

        const response = await OCPIOutgoingRequestService.sendPostRequest({
            url,
            headers: OCPIv221TokensModuleOutgoingRequestService.getAuthHeaders(),
            data: location,
        });

        const payload = response as OCPIAuthorizationInfoResponse;

        return {
            httpStatus: 200,
            payload,
        };
    }
}
