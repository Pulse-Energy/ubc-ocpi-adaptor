import { Request } from "express";
import { HttpResponse } from "../../../types/responses";
import { logger } from "../../../services/logger.service";
import UBCResponseService from "../../services/UBCResponseService";
import { UBCSupportRequestPayload } from "../../schema/v2.0.0/actions/support/types/SupportPayload";
import { BecknActionResponse } from "../../schema/v2.0.0/types/AckResponse";

/**
 * Handler for support action
 */
export default class SupportActionHandler {
    public static async handleSupport(req: Request): Promise<HttpResponse<BecknActionResponse>> {
        try {
            const payload = req.body as UBCSupportRequestPayload;
            
            logger.info('Handling support action', {
                context: payload.context,
                messageId: payload.context.message_id,
                transactionId: payload.context.transaction_id,
            });

            // TODO: Implement support action logic
            return UBCResponseService.ack();
        } catch (error: any) {
            logger.error('Error handling support action', error);
            return UBCResponseService.nack();
        }
    }
}

