import { Request } from "express";
import { HttpResponse } from "../../../types/responses";
import { logger } from "../../../services/logger.service";
import UBCResponseService from "../../services/UBCResponseService";
import { UBCTrackRequestPayload } from "../../schema/v2.0.0/actions/track/types/TrackPayload";
import { BecknActionResponse } from "../../schema/v2.0.0/types/AckResponse";

/**
 * Handler for track action
 */
export default class TrackActionHandler {
    public static async handleTrack(req: Request): Promise<HttpResponse<BecknActionResponse>> {
        try {
            const payload = req.body as UBCTrackRequestPayload;
            
            logger.info('Handling track action', {
                context: payload.context,
                messageId: payload.context.message_id,
                transactionId: payload.context.transaction_id,
            });

            // TODO: Implement track action logic
            return UBCResponseService.ack();
        } catch (error: any) {
            logger.error('Error handling track action', error);
            return UBCResponseService.nack();
        }
    }
}

