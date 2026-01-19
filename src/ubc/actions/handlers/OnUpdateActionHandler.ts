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
import PaymentTxnDbService from '../../../db-services/PaymentTxnDbService';
import { CDR as PrismaCDR } from '@prisma/client';
import { BecknOrderValueResponse, BecknOrderValueComponents } from '../../schema/v2.0.0/types/OrderValue';
import { OrderValueComponentsType } from '../../schema/v2.0.0/enums/OrderValueComponentsType';
import { SessionDbService } from '../../../db-services/SessionDbService';
// Import OCPIPrice type - using direct type definition to avoid path issues
type OCPIPrice = {
    excl_vat: number;
    incl_vat?: number;
};

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
        const order = existingBppOnUpdateResponse.message.order;
        const fulfillment = order['beckn:fulfillment'];
        const deliveryAttributes = fulfillment?.['beckn:deliveryAttributes'] as Record<string, unknown>;
        const sessionStatus = backendOnUpdateRequestPayload.session_status;

        // For async on_update (completed), reuse everything from existing on_update response, only update orderStatus and sessionStatus
        // Per schema (lines 2556-2630): on_update should NOT include orderAttributes
        // Build order object explicitly, excluding orderAttributes
        const ubcOnUpdatePayload: UBCOnUpdateRequestPayload = {
            context: Utils.getBPPContext({
                ...existingBppOnUpdateResponse.context,
                action: BecknAction.on_update,
            }),
            message: {
                order: {
                    "@context": order['@context'],
                    "@type": order['@type'],
                    "beckn:id": order['beckn:id'],
                    'beckn:orderStatus': OrderStatus.COMPLETED, // only update orderStatus
                    "beckn:seller": order['beckn:seller'],
                    "beckn:buyer": order['beckn:buyer'],
                    "beckn:orderItems": order['beckn:orderItems'],
                    "beckn:orderValue": order['beckn:orderValue'],
                    "beckn:payment": order['beckn:payment'],
                    'beckn:fulfillment': {
                        ...fulfillment, // reuse everything from existing on_update response
                        'beckn:deliveryAttributes': {
                            ...deliveryAttributes, // reuse everything from existing on_update response
                            'sessionStatus': sessionStatus, // only update sessionStatus
                        } as never,
                    },
                },
            },
        };

        // Conditionally include order_value if present in backend request
        if (backendOnUpdateRequestPayload?.order_value) {
            ubcOnUpdatePayload.message.order['beckn:orderValue'] = backendOnUpdateRequestPayload.order_value;
        }

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
            existingBppOnUpdateResponse?.message?.order?.['beckn:id'] !==
            payload?.beckn_order_id
        ) {
            throw new Error('Order id mismatch');
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

    /**
     * Builds order_value from CDR total_cost and breakdown costs
     */
    private static async buildOrderValueFromCDR(
        cdr: PrismaCDR
    ): Promise<BecknOrderValueResponse> {
        const currency = cdr.currency;
        const totalCost = cdr.total_cost as unknown as OCPIPrice;

        // Use incl_vat if available, otherwise excl_vat
        const totalValue = totalCost.incl_vat ?? totalCost.excl_vat;

        const components: BecknOrderValueComponents[] = [];

        const chargingSessionCost = totalCost.excl_vat;
        const cpoGst = totalCost?.incl_vat ? (totalCost.incl_vat - totalCost.excl_vat) : 0;
        const buyerFinderFee = totalCost.excl_vat * (0.9 / 100);
        const networkFinderFee = totalCost.excl_vat * (0.3 / 100);
        const total = chargingSessionCost + cpoGst + buyerFinderFee + networkFinderFee;

        components.push({
            type: OrderValueComponentsType.UNIT,
            value: chargingSessionCost,
            currency: currency,
            description: 'Charging session cost',
        });

        // Buyer finder fee
        components.push({
            type: OrderValueComponentsType.FEE,
            value: buyerFinderFee,
            currency: currency,
            description: 'Buyer finder fee',
        });

        // Network finder fee
        components.push({
            type: OrderValueComponentsType.FEE,
            value: networkFinderFee,
            currency: currency,
            description: 'Network finder fee',
        });

        // GST
        components.push({
            type: OrderValueComponentsType.TAX,
            value: cpoGst,
            currency: currency,
            description: 'GST',
        });

        // Add this to DB
        if (cdr.session_id) {
            await SessionDbService.update(cdr.session_id, {
                final_amount: {
                    charging_session_cost: totalCost.excl_vat,
                    gst: cpoGst,
                    buyer_finder_fee: buyerFinderFee,
                    network_finder_fee: networkFinderFee,
                    total: total,
                },
            });
        }

        return {
            currency: currency,
            value: totalValue,
            components: components,
        };
    }

    /**
     * Handles async on_update when CDR is received (session completed)
     * CDR → Extract authorization_reference → Find PaymentTxn → Send on_update
     */
    public static async handleOnUpdateFromCDR(
        authorizationReference: string,
        cdr: PrismaCDR
    ): Promise<void> {
        const logData = { action: 'on_update_from_cdr', authorization_reference: authorizationReference };

        try {
            logger.debug(
                `🟡 [${authorizationReference}] Starting handleOnUpdateFromCDR`,
                { data: logData }
            );

            // Find PaymentTxn by authorization_reference
            const paymentTxn = await PaymentTxnDbService.getFirstByFilter({
                where: {
                    authorization_reference: authorizationReference,
                },
            });

            if (!paymentTxn) {
                logger.warn(
                    `🟡 [${authorizationReference}] PaymentTxn not found in handleOnUpdateFromCDR`,
                    { data: logData }
                );
                return;
            }

            const becknTransactionId = paymentTxn.beckn_transaction_id;

            // Fetch existing on_update response to get beckn_order_id
            const existingBppOnUpdateResponse =
                await UpdateActionHandler.fetchExistingBppOnUpdateResponse(becknTransactionId);

            if (!existingBppOnUpdateResponse) {
                logger.warn(
                    `🟡 [${authorizationReference}] No existing on_update response found in handleOnUpdateFromCDR`,
                    { data: { ...logData, beckn_transaction_id: becknTransactionId } }
                );
                return;
            }

            const becknOrderId = existingBppOnUpdateResponse.message.order['beckn:id'];

            // Build order_value from CDR
            const orderValue = await OnUpdateActionHandler.buildOrderValueFromCDR(cdr);

            // Build ExtractedOnUpdateRequestBody
            const onUpdatePayload: ExtractedOnUpdateRequestBody = {
                beckn_order_id: becknOrderId,
                session_status: ChargingSessionStatus.COMPLETED,
                beckn_transaction_id: becknTransactionId,
                order_value: orderValue,
            };

            logger.debug(
                `🟡 [${authorizationReference}] Forwarding on_update to BPP ONIX in handleOnUpdateFromCDR`,
                { data: { ...logData, onUpdatePayload } }
            );

            // Forward on_update to BPP ONIX
            await OnUpdateActionHandler.forwardOnUpdateToBppOnix(onUpdatePayload);

            logger.debug(
                `🟢 [${authorizationReference}] Successfully sent on_update from CDR in handleOnUpdateFromCDR`,
                { data: logData }
            );
        }
        catch (e: any) {
            logger.error(
                `🔴 [${authorizationReference}] Error in handleOnUpdateFromCDR: ${e?.toString()}`,
                e,
                {
                    data: logData,
                }
            );
            // Don't throw - this is async and shouldn't block CDR processing
        }
    }
}
