import { Request } from 'express';
import { HttpResponse } from '../../../types/responses';
import { logger } from '../../../services/logger.service';
import { PostAppPublishRequestPayload } from '../../schema/v2.0.0/actions/publish/types/PostAppPublishRequestPayload';
import { AppPublishResponsePayload } from '../../schema/v2.0.0/actions/publish/types/AppPublishResponsePayload';
import PublishActionService from '../services/PublishActionService';
import RequestsStoreService from '../../../utils/RequestsStoreService';
import { UBCPublishRequestPayload } from '../../schema/v2.0.0/actions/publish/types/PublishPayload';

/**
 * Handler for publish action
 */
export default class PublishActionHandler {
    /**
     * Handles publish request - waits for stitched response from on_publish callback
     * Does not use requestWrapper because we need to wait for the callback before responding
     */
    public static async handleBppPublishRequest(
        req: Request
    ): Promise<HttpResponse<AppPublishResponsePayload>> {
        const payload = req.body as PostAppPublishRequestPayload;

        // Debug: Log the incoming request body structure
        logger.debug(`🟡 Received publish request body`, { 
            body: req.body,
            hasMetadata: !!payload?.metadata,
            hasPayload: !!payload?.payload 
        });

        if (!payload || !payload.metadata) {
            logger.error(`🔴 Invalid publish request payload structure`, undefined, { 
                body: req.body,
                payload 
            });
            throw new Error('Invalid publish request payload: metadata is required');
        }

        try {
            // Wait for stitched response (on_publish callback)
            const stitchedResponse = await PublishActionHandler.handleEVChargingUBCBppPublishAction(payload);

            logger.debug(`🟢 Returning stitched publish response in handleBppPublishRequest`, {
                data: stitchedResponse,
            });

            return {
                httpStatus: 200,
                payload: stitchedResponse,
            };
        }
        catch (e: any) {
            logger.error(`🔴 Error in handleBppPublishRequest: ${e?.toString()}`, e, {
                payload,
            });
            throw e;
        }
    }

    public static async handleEVChargingUBCBppPublishAction(
        reqPayload: PostAppPublishRequestPayload
    ): Promise<AppPublishResponsePayload> {
        const reqId = reqPayload.metadata?.beckn_transaction_id || 'unknown';
        const logData = { action: 'publish', transactionId: reqId };

        try {
            // Translate app payload to UBC format
            logger.debug(
                `🟡 [${reqId}] Translating app payload to UBC format in handleEVChargingUBCBppPublishAction`,
                { data: { logData, reqPayload } }
            );
            const ubcPublishPayload: UBCPublishRequestPayload = PublishActionService.translateAppPayloadToUBC(reqPayload);

            // Send publish request to CDS/ONIX and wait for stitched on_catalog_publish callback
            logger.debug(
                `🟡 [${reqId}] Sending publish call to CDS in handleEVChargingUBCBppPublishAction`,
                { data: { ubcPublishPayload } }
            );

            const stitchedResponse: AppPublishResponsePayload = await RequestsStoreService.getStitchedResponse({
                /**
                 * Using transaction_id to match the on_publish callback
                 */
                reqId: ubcPublishPayload.context.transaction_id,
                data: ubcPublishPayload,
                asyncFn: () => PublishActionService.sendPublishCallToBecknONIX(ubcPublishPayload),
            });

            logger.debug(
                `🟢 [${reqId}] Received stitched on_catalog_publish response in handleEVChargingUBCBppPublishAction`,
                { data: { stitchedResponse } }
            );

            return stitchedResponse;
        }
        catch (e: any) {
            logger.error(
                `🔴 [${reqId}] Error in PublishActionHandler.handleEVChargingUBCBppPublishAction: ${e?.toString()}`,
                e,
                {
                    data: logData,
                }
            );
            throw e;
        }
    }
}

