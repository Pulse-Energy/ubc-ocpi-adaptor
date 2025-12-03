import { Request } from "express";
import { HttpResponse } from "../../../types/responses";
import { logger } from "../../../services/logger.service";
import UBCResponseService from "../../services/UBCResponseService";
import { Context } from "../../schema/v2.0.0/types/Context";
import { UBCOrder } from "../../schema/v2.0.0/types/Order";
import { BecknActionResponse } from "../../schema/v2.0.0/types/AckResponse";

/**
 * Handler for cancel action
 */
export default class CancelActionHandler {
    public static async handleCancel(req: Request): Promise<HttpResponse<BecknActionResponse>> {
        try {
            const payload = req.body as { context: Context; message: { order: UBCOrder } };
            
            logger.info('Handling cancel action', {
                context: payload.context,
                messageId: payload.context.message_id,
                transactionId: payload.context.transaction_id,
            });

            // TODO: Implement cancel action logic
            return UBCResponseService.ack();
        } catch (error: any) {
            logger.error('Error handling cancel action', error);
            return UBCResponseService.nack();
        }
    }
}

