import { Request } from "express";
import { logger } from "../../../services/logger.service";
import { HttpResponse } from "../../../types/responses";
import { UBCInitRequestPayload } from "../../schema/v2.0.0/actions/init/types/InitPayload";
import { BecknActionResponse } from "../../schema/v2.0.0/types/AckResponse";
import UBCResponseService from "../../services/UBCResponseService";

/**
 * Handler for init action
 */
export default class InitActionHandler {
    public static async handleInit(req: Request): Promise<HttpResponse<BecknActionResponse>> {
        try {
            const payload = req.body as UBCInitRequestPayload;
            
            logger.info('Handling init action', {
                context: payload.context,
                messageId: payload.context.message_id,
                transactionId: payload.context.transaction_id,
            });

            // TODO: Implement init action logic
            return UBCResponseService.ack();
        } 
        catch (error: any) {
            logger.error('Error handling init action', error);
            return UBCResponseService.nack();
        }
    }
}

