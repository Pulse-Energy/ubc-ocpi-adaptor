import { Request } from "express";
import { logger } from "../../../services/logger.service";
import { HttpResponse } from "../../../types/responses";
import { UBCConfirmRequestPayload } from "../../schema/v2.0.0/actions/confirm/types/ConfirmPayload";
import { BecknActionResponse } from "../../schema/v2.0.0/types/AckResponse";
import UBCResponseService from "../../services/UBCResponseService";

/**
 * Handler for confirm action
 */
export default class ConfirmActionHandler {
    public static async handleConfirm(req: Request): Promise<HttpResponse<BecknActionResponse>> {
        try {
            const payload = req.body as UBCConfirmRequestPayload;

            logger.info('Handling confirm action', {
                context: payload.context,
                messageId: payload.context.message_id,
                transactionId: payload.context.transaction_id,
            });

            // TODO: Implement confirm action logic
            return UBCResponseService.ack();
        } catch (error: any) {
            logger.error('Error handling confirm action', error);
            return UBCResponseService.nack();
        }
    }
}

