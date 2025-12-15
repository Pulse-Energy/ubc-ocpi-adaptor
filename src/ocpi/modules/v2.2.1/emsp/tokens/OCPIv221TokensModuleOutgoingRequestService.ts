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
import { OCPILogCommand } from '../../../../types';

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
    private static async getCpoTokensBaseUrl(partnerId?: string): Promise<string> {
        return Utils.getOcpiEndpoint('tokens', 'RECEIVER', partnerId);
    }

    private static getAuthHeaders(cpoAuthToken: string): Record<string, string> {
        if (!cpoAuthToken) {
            throw new Error('CPO auth token is required to send OCPI token request');
        }
        return {
            Authorization: `Token ${cpoAuthToken}`,
        };
    }

    /**
     * GET /tokens – list tokens from CPO.
     */
    public static async sendGetTokens(
        req: Request,
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<HttpResponse<OCPITokensResponse>> {
        const baseUrl = await OCPIv221TokensModuleOutgoingRequestService.getCpoTokensBaseUrl(
            partnerId,
        );

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
            headers: OCPIv221TokensModuleOutgoingRequestService.getAuthHeaders(cpoAuthToken),
            partnerId,
            command: OCPILogCommand.SendGetTokensReq,
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
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<HttpResponse<OCPITokenResponse>> {
        const baseUrl = await OCPIv221TokensModuleOutgoingRequestService.getCpoTokensBaseUrl(
            partnerId,
        );
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
            headers: OCPIv221TokensModuleOutgoingRequestService.getAuthHeaders(cpoAuthToken),
            partnerId,
            command: OCPILogCommand.SendGetTokenReq,
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
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<HttpResponse<OCPITokenResponse>> {
        const baseUrl = await OCPIv221TokensModuleOutgoingRequestService.getCpoTokensBaseUrl(
            partnerId,
        );
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
            headers: OCPIv221TokensModuleOutgoingRequestService.getAuthHeaders(cpoAuthToken),
            data: token,
            partnerId,
            command: OCPILogCommand.SendPutTokenReq,
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
        cpoAuthToken: string,
        partnerId: string,
    ): Promise<HttpResponse<OCPIResponsePayload<OCPIToken>>> {
        const baseUrl = await OCPIv221TokensModuleOutgoingRequestService.getCpoTokensBaseUrl(
            partnerId,
        );
        const path = `${baseUrl}/${token.country_code}/${token.party_id}/${token.uid}`;

        const response = await OCPIOutgoingRequestService.sendPutRequest({
            url: path,
            headers: OCPIv221TokensModuleOutgoingRequestService.getAuthHeaders(cpoAuthToken),
            data: token,
            partnerId,
            command: OCPILogCommand.SendPutTokenDirectReq,
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
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<HttpResponse<OCPITokenResponse>> {
        const baseUrl = await OCPIv221TokensModuleOutgoingRequestService.getCpoTokensBaseUrl(
            partnerId,
        );
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
            headers: OCPIv221TokensModuleOutgoingRequestService.getAuthHeaders(cpoAuthToken),
            data: patch,
            partnerId,
            command: OCPILogCommand.SendPatchTokenReq,
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
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<HttpResponse<OCPIAuthorizationInfoResponse>> {
        const baseUrl = await OCPIv221TokensModuleOutgoingRequestService.getCpoTokensBaseUrl(
            partnerId,
        );
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
            headers: OCPIv221TokensModuleOutgoingRequestService.getAuthHeaders(cpoAuthToken),
            data: location,
            partnerId,
            command: OCPILogCommand.SendPostAuthorizeTokenReq,
        });

        const payload = response as OCPIAuthorizationInfoResponse;

        return {
            httpStatus: 200,
            payload,
        };
    }
}
