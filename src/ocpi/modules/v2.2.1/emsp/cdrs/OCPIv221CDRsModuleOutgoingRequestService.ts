import { Request } from 'express';
import { HttpResponse } from '../../../../../types/responses';
import { OCPICDRResponse, OCPICDRsResponse } from '../../../../schema/modules/cdrs/types/responses';
import { OCPICDR } from '../../../../schema/modules/cdrs/types';
import OCPIOutgoingRequestService from '../../../../services/OCPIOutgoingRequestService';
import Utils from '../../../../../utils/Utils';
import { OCPIResponsePayload } from '../../../../schema/general/types/responses';
import { OCPILogCommand } from '../../../../types';

/**
 * OCPI 2.2.1 – CDRs module (outgoing, EMSP → CPO).
 *
 * Uses the CPO CDRs "SENDER" endpoint from Utils.getAllEndpoints():
 *   - GET  /cdrs
 *   - GET  /cdrs/{cdr_id}
 *   - POST /cdrs
 */
export default class OCPIv221CDRsModuleOutgoingRequestService {
    private static async getCpoCdrsBaseUrl(): Promise<string> {
        return Utils.getOcpiEndpoint('cdrs', 'SENDER');
    }

    private static getAuthHeaders(): Record<string, string> {
        const token = process.env.OCPI_CPO_AUTH_TOKEN || '';
        return {
            Authorization: `Token ${token}`,
        };
    }

    /**
     * GET /cdrs – list CDRs from CPO.
     */
    public static async sendGetCDRs(
        req: Request,
    ): Promise<HttpResponse<OCPICDRsResponse>> {
        const baseUrl = await OCPIv221CDRsModuleOutgoingRequestService.getCpoCdrsBaseUrl();

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
            headers: OCPIv221CDRsModuleOutgoingRequestService.getAuthHeaders(),
            command: OCPILogCommand.SendGetCdrsReq,
        });

        const payload = response.data as OCPICDRsResponse;

        return {
            httpStatus: 200,
            payload,
        };
    }

    /**
     * GET /cdrs/{cdr_id}
     */
    public static async sendGetCDR(
        req: Request,
    ): Promise<HttpResponse<OCPICDRResponse>> {
        const baseUrl = await OCPIv221CDRsModuleOutgoingRequestService.getCpoCdrsBaseUrl();
        const { cdr_id } = req.params as { cdr_id: string };

        const path = `${baseUrl}/${cdr_id}`;

        const response = await OCPIOutgoingRequestService.sendGetRequest({
            url: path,
            headers: OCPIv221CDRsModuleOutgoingRequestService.getAuthHeaders(),
            command: OCPILogCommand.SendGetCdrReq,
        });

        const payload = response.data as OCPICDRResponse;

        return {
            httpStatus: 200,
            payload,
        };
    }

    /**
     * POST /cdrs
     */
    public static async sendPostCDR(
        req: Request,
    ): Promise<HttpResponse<OCPICDRResponse>> {
        const baseUrl = await OCPIv221CDRsModuleOutgoingRequestService.getCpoCdrsBaseUrl();
        const payload = req.body as OCPICDR;

        const response = await OCPIOutgoingRequestService.sendPostRequest({
            url: baseUrl,
            headers: OCPIv221CDRsModuleOutgoingRequestService.getAuthHeaders(),
            data: payload,
            command: OCPILogCommand.SendPostCdrReq,
        });

        const payloadOut = response as OCPIResponsePayload<OCPICDR>;

        return {
            httpStatus: 200,
            payload: payloadOut,
        };
    }
}
