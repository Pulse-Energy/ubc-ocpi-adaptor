import axios from "axios";
import Utils from "../../utils/Utils";
import BecknLoggingService from "./BecknLoggingService";
import { logger } from "../../services/logger.service";

export default class CPOBackendRequestService {
    static async sendPostRequest(requestConfig: {
        url: string;
        headers: Record<string, string>;
        data: any;
    }): Promise<any> {
        const {
            url,
            headers,
            data = {},
        } = requestConfig;

        let logData = {
            url,
            data,
            headers: {},
        };

        // for logging
        const reqId = Utils.generateRandomString(6);

        try {
            logger.debug(`🟡 [${reqId}] Starting CPOBackendRequestService.sendPostRequest`, { data: logData });

            let reqHeaders = {
                ...headers,
            };

            reqHeaders['Content-Type'] = 'application/json';

            logData.headers = reqHeaders;

            const responseLogMetaData = {
                transactionId: data?.context?.transaction_id || '',
                messageId: data?.context?.message_id || '',
                domain: data?.context?.domain || '',
                action: data?.context?.action || '',
            }   

            BecknLoggingService.log({
                reqId: reqId,
                url: url,
                method: 'POST',
                headers: reqHeaders,
                payload: data,
                action: 'bpp.out.request',
            });

            logger.debug(`🟡 [${reqId}] Sending CPOBackendRequestService.sendPostRequest`, { data: logData });

            return axios.post(url, data, {
                headers: reqHeaders,
                // timeout: 3000,
            })
                .then((response) => {
                    logger.debug(`🟢 [${reqId}] Received CPOBackendRequestService.sendPostRequest response`, { data: logData });

                    BecknLoggingService.log({
                        reqId: reqId,
                        url: url,
                        method: 'POST',
                        headers: reqHeaders,
                        payload: response.data,
                        action: 'bpp.out.response',
                        logMetaData: responseLogMetaData,
                    });

                    return response.data;
                })
                .catch((e: any) => {
                    logger.error(`🔴 [${reqId}] Error in CPOBackendRequestService.sendPostRequest: ${e?.toString()}`, e, {
                        data: logData,
                    });
                    throw e;
                });
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error drafting request in CPOBackendRequestService.sendPostRequest: ${e?.toString()}`, e, {
                data: logData,
            });
            throw e;
        }
    }
}
