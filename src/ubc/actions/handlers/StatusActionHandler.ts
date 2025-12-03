import { Request } from "express";
import { HttpResponse } from "../../../types/responses";
import { logger } from "../../../services/logger.service";
import UBCResponseService from "../../services/UBCResponseService";
import { Context } from "../../schema/v2.0.0/types/Context";
import { BecknActionResponse } from "../../schema/v2.0.0/types/AckResponse";

/**
 * Handler for status action
 */
export default class StatusActionHandler {
    public static async handleStatus(req: Request): Promise<HttpResponse<BecknActionResponse>> {
        try {
            const payload = req.body as { context: Context };
            
            logger.info('Handling status action', {
                context: payload.context,
                messageId: payload.context.message_id,
                transactionId: payload.context.transaction_id,
            });

            // TODO: Implement status action logic
            return UBCResponseService.ack();
        } catch (error: any) {
            logger.error('Error handling status action', error);
            return UBCResponseService.nack();
        }
    }
}

