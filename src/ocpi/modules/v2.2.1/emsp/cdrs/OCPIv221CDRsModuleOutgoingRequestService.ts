import { Request } from 'express';
import { HttpResponse } from '../../../../../types/responses';
import { OCPICDRResponse, OCPICDRsResponse } from '../../../../schema/modules/cdrs/types/responses';
import { OCPICDR } from '../../../../schema/modules/cdrs/types';
import OCPIOutgoingRequestService from '../../../../services/OCPIOutgoingRequestService';
import Utils from '../../../../../utils/Utils';
import { OCPIResponsePayload } from '../../../../schema/general/types/responses';
import { OCPILogCommand } from '../../../../types';
import { logger } from '../../../../../services/logger.service';

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
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || `outgoing-${Date.now()}`;
        const logData = { action: 'sendGetCDRs' };

        try {
            logger.debug(`🟡 [${reqId}] Starting sendGetCDRs in OCPIv221CDRsModuleOutgoingRequestService`, { data: logData });

            logger.debug(`🟡 [${reqId}] Getting CPO CDRs base URL in sendGetCDRs`, { data: logData });
            const baseUrl = await OCPIv221CDRsModuleOutgoingRequestService.getCpoCdrsBaseUrl();

            logger.debug(`🟡 [${reqId}] Building query parameters in sendGetCDRs`, { 
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

            logger.debug(`🟡 [${reqId}] Sending GET request to CPO /cdrs in sendGetCDRs`, { 
                data: { ...logData, url } 
            });
            const response = await OCPIOutgoingRequestService.sendGetRequest({
                url,
                headers: OCPIv221CDRsModuleOutgoingRequestService.getAuthHeaders(),
                command: OCPILogCommand.SendGetCdrsReq,
            });

            logger.debug(`🟢 [${reqId}] Received response from CPO /cdrs in sendGetCDRs`, { 
                data: { ...logData, hasData: !!response.data } 
            });
            const payload = response.data as OCPICDRsResponse;

            logger.debug(`🟢 [${reqId}] Returning sendGetCDRs response`, { 
                data: { ...logData, payload } 
            });

            return {
                httpStatus: 200,
                payload,
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in sendGetCDRs: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * GET /cdrs/{cdr_id}
     */
    public static async sendGetCDR(
        req: Request,
    ): Promise<HttpResponse<OCPICDRResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || `outgoing-${Date.now()}`;
        const logData = { action: 'sendGetCDR' };

        try {
            logger.debug(`🟡 [${reqId}] Starting sendGetCDR in OCPIv221CDRsModuleOutgoingRequestService`, { data: logData });

            logger.debug(`🟡 [${reqId}] Getting CPO CDRs base URL in sendGetCDR`, { data: logData });
            const baseUrl = await OCPIv221CDRsModuleOutgoingRequestService.getCpoCdrsBaseUrl();
            const { cdr_id } = req.params as { cdr_id: string };

            logger.debug(`🟡 [${reqId}] Building URL path in sendGetCDR`, { 
                data: { ...logData, cdr_id } 
            });
            const path = `${baseUrl}/${cdr_id}`;

            logger.debug(`🟡 [${reqId}] Sending GET request to CPO /cdrs/:cdr_id in sendGetCDR`, { 
                data: { ...logData, url: path } 
            });
            const response = await OCPIOutgoingRequestService.sendGetRequest({
                url: path,
                headers: OCPIv221CDRsModuleOutgoingRequestService.getAuthHeaders(),
                command: OCPILogCommand.SendGetCdrReq,
            });

            logger.debug(`🟢 [${reqId}] Received response from CPO /cdrs/:cdr_id in sendGetCDR`, { 
                data: { ...logData, hasData: !!response.data } 
            });
            const payload = response.data as OCPICDRResponse;

            logger.debug(`🟢 [${reqId}] Returning sendGetCDR response`, { 
                data: { ...logData, payload } 
            });

            return {
                httpStatus: 200,
                payload,
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in sendGetCDR: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    /**
     * POST /cdrs
     */
    public static async sendPostCDR(
        req: Request,
    ): Promise<HttpResponse<OCPICDRResponse>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || `outgoing-${Date.now()}`;
        const logData = { action: 'sendPostCDR' };

        try {
            logger.debug(`🟡 [${reqId}] Starting sendPostCDR in OCPIv221CDRsModuleOutgoingRequestService`, { data: logData });

            logger.debug(`🟡 [${reqId}] Getting CPO CDRs base URL in sendPostCDR`, { data: logData });
            const baseUrl = await OCPIv221CDRsModuleOutgoingRequestService.getCpoCdrsBaseUrl();
            const payload = req.body as OCPICDR;

            logger.debug(`🟡 [${reqId}] Parsing POST CDR payload in sendPostCDR`, { 
                data: { ...logData, payload } 
            });

            logger.debug(`🟡 [${reqId}] Sending POST request to CPO /cdrs in sendPostCDR`, { 
                data: { ...logData, url: baseUrl } 
            });
            const response = await OCPIOutgoingRequestService.sendPostRequest({
                url: baseUrl,
                headers: OCPIv221CDRsModuleOutgoingRequestService.getAuthHeaders(),
                data: payload,
                command: OCPILogCommand.SendPostCdrReq,
            });

            logger.debug(`🟢 [${reqId}] Received response from CPO /cdrs in sendPostCDR`, { 
                data: { ...logData, hasData: !!response } 
            });
            const payloadOut = response as OCPIResponsePayload<OCPICDR>;

            logger.debug(`🟢 [${reqId}] Returning sendPostCDR response`, { 
                data: { ...logData, payload: payloadOut } 
            });

            return {
                httpStatus: 200,
                payload: payloadOut,
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in sendPostCDR: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }
}
