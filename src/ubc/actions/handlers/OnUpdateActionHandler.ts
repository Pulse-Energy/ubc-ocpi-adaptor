import { Request } from 'express';
import { HttpResponse } from '../../../types/responses';
import { logger } from '../../../services/logger.service';
import UBCResponseService from '../../services/UBCResponseService';
import { BecknActionResponse } from '../../schema/v2.0.0/types/AckResponse';
import Utils from '../../../utils/Utils';
import BppOnixRequestService from '../../services/BppOnixRequestService';
import { BecknDomain } from '../../schema/v2.0.0/enums/BecknDomain';
import { BecknAction } from '../../schema/v2.0.0/enums/BecknAction';
import { UBCOnUpdateRequestPayload } from '../../schema/v2.0.0/actions/update/types/OnUpdatePayload';
import { ExtractedOnUpdateRequestBody } from '../../schema/v2.0.0/actions/update/types/ExtractedOnUpdateRequestPayload';
import { OrderStatus } from '../../schema/v2.0.0/enums/OrderStatus';
import { ChargingSessionStatus } from '../../schema/v2.0.0/enums/ChargingSessionStatus';
import UpdateActionHandler from './UpdateActionHandler';

/**
 * Handler for status action
 */
export default class OnUpdateActionHandler {
    public static async handleBppOnUpdateRequest(
        reqDetails: Request
    ): Promise<HttpResponse<BecknActionResponse>> {
        try {
            logger.debug(`🟡 Received on_update request in handleBppOnUpdateRequest`, {
                data: reqDetails,
            });

            const body = reqDetails.body as ExtractedOnUpdateRequestBody;

            // Forward on_update to BPP ONIX (no response needed as request comes from backend)
            await OnUpdateActionHandler.handleEVChargingUBCBppOnUpdateAction(body);

            logger.debug(`🟢 Sending on_update response in handleBppOnUpdateRequest`, { data: {} });

            return UBCResponseService.ack();
        } 
        catch (e: any) {
            logger.error(`🔴 Error in handleBppOnStatusRequest`, e, {
                data: { message: 'Something went wrong' },
            });

            return UBCResponseService.nack();
        }
    }

    public static async handleEVChargingUBCBppOnUpdateAction(
        reqPayload: ExtractedOnUpdateRequestBody
    ): Promise<void> {
        const { beckn_transaction_id } = reqPayload;
        const logData = { action: 'on_update', beckn_transaction_id: beckn_transaction_id };

        try {
            // Forward on_update to BPP ONIX
            logger.debug(
                `🟡 [${beckn_transaction_id}] Forwarding on_update to BPP ONIX in handleEVChargingUBCBppOnUpdateAction`,
                { data: { logData, reqPayload } }
            );
            const response = await OnUpdateActionHandler.forwardOnUpdateToBppOnix(reqPayload);
            logger.debug(
                `🟢 [${beckn_transaction_id}] Forwarded on_update to BPP ONIX in handleEVChargingUBCBppOnUpdateAction`,
                { data: { response } }
            );
        } 
        catch (e: any) {
            logger.error(
                `🔴 [${beckn_transaction_id}] Error in OnStatusActionHandler.handleEVChargingUBCBppOnStatusAction: ${e?.toString()}`,
                e,
                {
                    data: { logData },
                }
            );
            throw e;
        }
    }


    public static translateBackendToUBC(
        existingBppOnUpdateResponse: UBCOnUpdateRequestPayload,
        backendOnUpdateRequestPayload: ExtractedOnUpdateRequestBody
    ): UBCOnUpdateRequestPayload {
        const ubcOnUpdatePayload: UBCOnUpdateRequestPayload = {
            context: {
                ...existingBppOnUpdateResponse.context,
                action: BecknAction.on_update,
            },
            message: {
                order: {
                    ...existingBppOnUpdateResponse.message.order,
                    'beckn:orderStatus': OrderStatus.COMPLETED,
                    'beckn:fulfillment': {
                        ...existingBppOnUpdateResponse.message.order['beckn:fulfillment'],
                        'beckn:deliveryAttributes': {
                            ...existingBppOnUpdateResponse.message.order['beckn:fulfillment'][
                                'beckn:deliveryAttributes'
                            ],
                            sessionStatus: backendOnUpdateRequestPayload.session_status,
                        },
                    },
                },
            },
        };

        return ubcOnUpdatePayload;
    }

    /**
     * Receives on_update from backend and forwards to BPP ONIX
     * Backend → BPP Provider → BPP ONIX
     */
    public static async forwardOnUpdateToBppOnix(
        payload: ExtractedOnUpdateRequestBody
    ): Promise<void> {
        const becknTransactionId = payload.beckn_transaction_id;

        const existingBppOnUpdateResponse =
            await UpdateActionHandler.fetchExistingBppOnUpdateResponse(becknTransactionId);

        if (!existingBppOnUpdateResponse) {
            throw new Error('No existing on_update response found');
        }

        if (
            existingBppOnUpdateResponse?.message?.order?.['beckn:orderNumber'] !==
            payload?.beckn_order_id
        ) {
            throw new Error('Order number mismatch');
        }

        if (payload?.session_status !== ChargingSessionStatus.COMPLETED) {
            throw new Error('Session status is not completed');
        }

        // Convert backend payload to UBC format
        const ubcOnUpdatePayload = this.translateBackendToUBC(existingBppOnUpdateResponse, payload);

        const bppHost = Utils.getBPPClientHost();

        await BppOnixRequestService.sendPostRequest(
            {
                url: `${bppHost}/${BecknAction.on_update}`,
                data: ubcOnUpdatePayload,
            },
            BecknDomain.EVChargingUBC
        );
    }
}
