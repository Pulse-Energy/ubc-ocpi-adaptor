import { Request } from "express";
import { HttpResponse } from "../../../types/responses";
import { logger } from "../../../services/logger.service";
import UBCResponseService from "../../services/UBCResponseService";
import { UBCSelectRequestPayload } from "../../schema/v2.0.0/actions/select/types/SelectPayload";
import { BecknActionResponse } from "../../schema/v2.0.0/types/AckResponse";

/**
 * Handler for select action
 */
export default class SelectActionHandler {
    public static async handleSelect(req: Request): Promise<HttpResponse<BecknActionResponse>> {
        try {
            const payload = req.body as UBCSelectRequestPayload;
            
            logger.info('Handling select action', {
                context: payload.context,
                messageId: payload.context.message_id,
                transactionId: payload.context.transaction_id,
            });

            // TODO: Implement select action logic
            return UBCResponseService.ack();
        } catch (error: any) {
            logger.error('Error handling select action', error);
            return UBCResponseService.nack();
        }
    }
}

