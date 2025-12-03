import { Request } from "express";
import { HttpResponse } from "../../../types/responses";
import { logger } from "../../../services/logger.service";
import UBCResponseService from "../../services/UBCResponseService";
import { UBCUpdateRequestPayload } from "../../schema/v2.0.0/actions/update/types/UpdatePayload";
import { BecknActionResponse } from "../../schema/v2.0.0/types/AckResponse";

/**
 * Handler for update action
 */
export default class UpdateActionHandler {
    public static async handleUpdate(req: Request): Promise<HttpResponse<BecknActionResponse>> {
        try {
            const payload = req.body as UBCUpdateRequestPayload;
            
            logger.info('Handling update action', {
                context: payload.context,
                messageId: payload.context.message_id,
                transactionId: payload.context.transaction_id,
            });

            // TODO: Implement update action logic
            return UBCResponseService.ack();
        } catch (error: any) {
            logger.error('Error handling update action', error);
            return UBCResponseService.nack();
        }
    }
}

