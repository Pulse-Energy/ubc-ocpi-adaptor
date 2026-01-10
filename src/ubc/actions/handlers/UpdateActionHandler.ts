import { Request } from 'express';
import { HttpResponse } from '../../../types/responses';
import { logger } from '../../../services/logger.service';
import { UBCUpdateRequestPayload } from '../../schema/v2.0.0/actions/update/types/UpdatePayload';
import { BecknActionResponse } from '../../schema/v2.0.0/types/AckResponse';
import { BecknAction } from '../../schema/v2.0.0/enums/BecknAction';
import OnixBppController from '../../controller/OnixBppController';
import BecknLogDbService from '../../../db-services/BecknLogDbService';
import { BecknDomain } from '../../schema/v2.0.0/enums/BecknDomain';
import { Prisma } from '@prisma/client';
import Utils from '../../../utils/Utils';
import { ChargingSessionStatus } from '../../schema/v2.0.0/enums/ChargingSessionStatus';
import { OrderStatus } from '../../schema/v2.0.0/enums/OrderStatus';
import { UBCOnUpdateRequestPayload } from '../../schema/v2.0.0/actions/update/types/OnUpdatePayload';
import BppOnixRequestService from '../../services/BppOnixRequestService';
import { ExtractedUpdateRequestBody } from '../../schema/v2.0.0/actions/update/types/ExtractedUpdateRequestPayload';
import { ExtractedOnUpdateResponsePayload } from '../../schema/v2.0.0/actions/update/types/ExtractedOnUpdateResponsePayload';
import { ChargingAction } from '../../schema/v2.0.0/enums/ChargingAction';
import AdminCommandsModule from '../../../admin/modules/AdminCommandsModule';
import { SessionDbService } from '../../../db-services/SessionDbService';
import { LocationDbService } from '../../../db-services/LocationDbService';
import { OCPICommandResponseResponse } from '../../../ocpi/schema/modules/commands/types/responses';
import { OCPICommandResponseType } from '../../../ocpi/schema/modules/commands/enums';
import PaymentTxnDbService from '../../../db-services/PaymentTxnDbService';
import { BecknPaymentStatus } from '../../schema/v2.0.0/enums/PaymentStatus';
import { databaseService } from '../../../services/database.service';

/**
 * Handler for update action
 */
export default class UpdateActionHandler {
    public static async handleBppUpdateAction(
        req: Request
    ): Promise<HttpResponse<BecknActionResponse>> {
        const payload = req.body as UBCUpdateRequestPayload;

        return OnixBppController.requestWrapper(BecknAction.update, req, () => {
            UpdateActionHandler.handleEVChargingUBCBppUpdateAction(payload)
                .then((ubcOnUpdateResponsePayload: UBCOnUpdateRequestPayload) => {
                    logger.debug(`🟢 Sending select response in handleBppSelectRequest`, {
                        data: ubcOnUpdateResponsePayload,
                    });
                })
                .catch((e: Error) => {
                    logger.error(`🔴 Error in handleBppSelectRequest: 'Something went wrong'`, e);
                });
        });
    }

    public static async handleEVChargingUBCBppUpdateAction(
        reqPayload: UBCUpdateRequestPayload
    ): Promise<UBCOnUpdateRequestPayload> {
        const reqId = reqPayload.context?.message_id || 'unknown';
        const logData = { action: 'update', messageId: reqId };

        try {
            // translate BAP schema to CPO's BE server
            logger.debug(
                `🟡 [${reqId}] Translating UBC to Backend payload in handleEVChargingUBCBppUpdateAction`,
                { data: { logData, reqPayload } }
            );
            const backendUpdatePayload: ExtractedUpdateRequestBody =
                UpdateActionHandler.translateUBCToBackendPayload(reqPayload);

            // make a request to CPO BE server
            logger.debug(
                `🟡 [${reqId}] Sending update call to backend in handleEVChargingUBCBppUpdateAction`,
                { data: { backendUpdatePayload } }
            );
            const ExtractedOnUpdateResponseBody: ExtractedOnUpdateResponsePayload =
                await UpdateActionHandler.sendUpdateCallToBackend(backendUpdatePayload);
            logger.debug(
                `🟢 [${reqId}] Received update response from backend in handleEVChargingUBCBppUpdateAction`,
                { data: { ExtractedOnUpdateResponseBody } }
            );

            // Fetch existing status response to reuse payment (same as status)
            const existingOnStatusResponse = await UpdateActionHandler.fetchExistingBppOnStatusResponse(reqPayload.context.transaction_id);

            // translate CPO's BE Server response to UBC Schema
            logger.debug(
                `🟡 [${reqId}] Translating Backend to UBC payload in handleEVChargingUBCBppUpdateAction`,
                { data: { reqPayload, ExtractedOnUpdateResponseBody } }
            );
            const ubcOnUpdatePayload: UBCOnUpdateRequestPayload =
                UpdateActionHandler.translateBackendToUBC(
                    reqPayload,
                    ExtractedOnUpdateResponseBody,
                    existingOnStatusResponse
                );

            // Call BAP on_select
            logger.debug(
                `🟡 [${reqId}] Sending on_update call to Beckn ONIX in handleEVChargingUBCBppUpdateAction`,
                { data: { ubcOnUpdatePayload } }
            );
            const response =
                await UpdateActionHandler.sendOnUpdateCallToBecknONIX(ubcOnUpdatePayload);
            logger.debug(
                `🟢 [${reqId}] Sent on_update call to Beckn ONIX in handleEVChargingUBCBppUpdateAction`,
                { data: { response } }
            );

            // return the response
            return ubcOnUpdatePayload;
        } 
        catch (e: any) {
            logger.error(
                `🔴 [${reqId}] Error in UBCBppActionService.handleEVChargingUBCBppUpdateAction: ${e?.toString()}`,
                e,
                {
                    data: { logData },
                }
            );

            // Send error response to BAP side so the stitched response can be resolved
            // This prevents the request from getting stuck in REQUESTS_STORE waiting for a callback
            // try {
            //     await UpdateActionHandler.sendErrorOnUpdateResponse(reqPayload, e instanceof Error ? e : new Error(e?.toString() || 'Unknown error'));
            // }
            // catch (sendError: any) {
            //     logger.error(`🔴 [${reqId}] Error sending error on_update response`, {
            //         data: { message: 'Failed to send error response' },
            //         error: sendError
            //     });
            // }

            throw e;
        }
    }

    public static async fetchExistingBppOnUpdateResponse(
        transactionId: string
    ): Promise<UBCOnUpdateRequestPayload | null> {
        /**
         * If beckn transaction id is provided, check if the on update response for this transaction id is already present in the database.
         * if yes, return the response from the database. if no, then proceed to the next step.
         */
        const becknLogs = await BecknLogDbService.getByFilters({
            where: {
                transaction_id: transactionId,
                action: `bpp.out.request.${BecknAction.on_update}`,
                domain: BecknDomain.EVChargingUBC,
            },
            select: {
                payload: true,
            },
            orderBy: {
                created_on: Prisma.SortOrder.desc,
            },
            take: 1,
        });

        if (becknLogs?.records && becknLogs.records.length > 0) {
            return becknLogs.records[0].payload as UBCOnUpdateRequestPayload;
        }

        return null;
    }

    public static async fetchExistingBppOnStatusResponse(transactionId: string): Promise<any | null> {
        const becknLogs = await BecknLogDbService.getByFilters({
            where: {
                transaction_id: transactionId,
                action: `bpp.out.request.${BecknAction.on_status}`,
                domain: BecknDomain.EVChargingUBC,
            },
            select: {
                payload: true,
            },
            orderBy: {
                created_on: Prisma.SortOrder.desc,
            },
            take: 1,
        });

        if (becknLogs?.records && becknLogs.records.length > 0) {
            return becknLogs.records[0].payload;
        }

        return null;
    }

    /**
     * Determines the charging action based on session status
     * Start charging: sessionStatus is "PENDING" (user wants to start the charging session)
     * Stop charging: sessionStatus is "STOP" (user wants to stop during an active session)
     */
    public static determineChargingAction(sessionStatus: string | ChargingSessionStatus): ChargingAction {
        if (sessionStatus === ChargingSessionStatus.PENDING) {
            return ChargingAction.StartCharging;
        }
        else if (sessionStatus === 'STOP') {
            return ChargingAction.StopCharging;
        }
        else {
            throw new Error(`Invalid sessionStatus for update action: ${sessionStatus}. Expected "PENDING" for start charging or "STOP" for stop charging.`);
        }
    }

    public static translateUBCToBackendPayload(
        payload: UBCUpdateRequestPayload
    ): ExtractedUpdateRequestBody {
        const deliveryAttributes = payload.message.order['beckn:fulfillment']['beckn:deliveryAttributes'] as Record<string, unknown>;
        const sessionStatus = deliveryAttributes?.sessionStatus as ChargingSessionStatus;

        const backendUpdatePayload: ExtractedUpdateRequestBody = {
            metadata: {
                domain: BecknDomain.EVChargingUBC,
                bpp_id: payload.context.bpp_id,
                bpp_uri: payload.context.bpp_uri,
                beckn_transaction_id: payload.context.transaction_id,
                bap_id: payload.context.bap_id || '',
                bap_uri: payload.context.bap_uri || '',
            },
            payload: {
                charge_point_connector_id:
                    payload.message.order['beckn:orderItems'][0]['beckn:orderedItem'],
                beckn_order_id: payload.message.order['beckn:id'], // Use beckn:id instead of beckn:orderNumber
                charging_action: this.determineChargingAction(sessionStatus),
            },
        };
        return backendUpdatePayload;
    }

    public static async sendUpdateCallToBackend(
        payload: ExtractedUpdateRequestBody
    ): Promise<ExtractedOnUpdateResponsePayload> {
        const { beckn_order_id, charging_action, charge_point_connector_id } = payload.payload;

        const paymentTxn = await PaymentTxnDbService.getFirstByFilter({
            where: {
                authorization_reference: beckn_order_id,
            },
        });

        if (!paymentTxn) {
            throw new Error('Payment txn not found');
        }

        if (paymentTxn.status !== BecknPaymentStatus.COMPLETED) {
            throw new Error('Payment txn is not completed');
        }
        
        if (charging_action === ChargingAction.StartCharging) {
            
            // Find EVSE directly from Beckn connector ID
            const evse = await LocationDbService.findEVSEByBecknConnectorId(charge_point_connector_id);
            
            if (!evse) {
                throw new Error(`EVSE not found for: ${charge_point_connector_id}`);
            }

            // Get connector from EVSE
            const parsedConnectorId = LocationDbService.parseBecknConnectorId(charge_point_connector_id);
            const evseConnector = evse.evse_connectors.find(
                connector => connector.connector_id === parsedConnectorId.connectorId && !connector.deleted
            );
            
            if (!evseConnector) {
                throw new Error(`EVSE Connector not found for: ${charge_point_connector_id}`);
            }

            // Get location to get ocpi_location_id
            const location = await databaseService.prisma.location.findUnique({
                where: { id: evse.location_id },
                select: { ocpi_location_id: true },
            });

            if (!location) {
                throw new Error(`Location not found for EVSE: ${evse.id}`);
            }
    
            const req = {
                body: {
                    partner_id: evse.partner_id ?? '',
                    location_id: location.ocpi_location_id,
                    evse_uid: evse.uid,
                    connector_id: evseConnector.connector_id,
                    transaction_id: beckn_order_id,
                },
            } as Request;

            // Check if session already exists (update action can be called multiple times)
            let session = await SessionDbService.getByAuthorizationReference(beckn_order_id);
            if (!session) {
                // Only create if it doesn't exist
                session = await SessionDbService.create({
                    data: {
                        country_code: 'IN',
                        partner_id: evse.partner_id ?? '',
                        location_id: location.ocpi_location_id,
                        evse_uid: evse.uid,
                        connector_id: parsedConnectorId.connectorId,
                        authorization_reference: beckn_order_id,
                        requested_energy_units: paymentTxn.requested_energy_units,
                    },
                });
            }
            const response = await AdminCommandsModule.startCharging(req);
            const ocpiCommandResponse = response.payload.data as OCPICommandResponseResponse;
            
            return {
                session_status: ocpiCommandResponse.data?.result === OCPICommandResponseType.ACCEPTED ? ChargingSessionStatus.ACTIVE : ChargingSessionStatus.INTERRUPTED,
            };
        } 
        else if (charging_action === ChargingAction.StopCharging) {
            const session = await SessionDbService.getByAuthorizationReference(beckn_order_id);
            if (!session) {
                throw new Error('Session not found');
            }
            const req = {
                body: {
                    partner_id: session.partner_id,
                    session_id: session.cpo_session_id,
                },
            } as Request;
            const response = await AdminCommandsModule.stopCharging(req);
            const ocpiCommandResponse = response.payload.data as OCPICommandResponseResponse;
            
            return {
                session_status: ocpiCommandResponse.data?.result === OCPICommandResponseType.ACCEPTED ? ChargingSessionStatus.COMPLETED : ChargingSessionStatus.ACTIVE,
            };
        }
        else {
            throw new Error('Invalid charging action');
        }
    }

    public static translateBackendToUBC(
        backendUpdatePayload: UBCUpdateRequestPayload,
        ExtractedOnUpdateResponseBody: ExtractedOnUpdateResponsePayload,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        existingOnStatusResponse: any | null // Not used currently, but kept for consistency with reference implementation
    ): UBCOnUpdateRequestPayload {
        const context = Utils.getBPPContext({
            ...backendUpdatePayload.context,
            action: BecknAction.on_update,
        });

        const order = backendUpdatePayload.message.order;
        const fulfillment = order['beckn:fulfillment'];
        const deliveryAttributes = fulfillment?.['beckn:deliveryAttributes'] as Record<string, unknown>;
        const sessionStatus = ExtractedOnUpdateResponseBody.session_status;

        // Determine orderStatus based on session status
        let orderStatus: OrderStatus;
        if (sessionStatus === ChargingSessionStatus.ACTIVE) {
            orderStatus = OrderStatus.INPROGRESS;
        }
        else if (sessionStatus === ChargingSessionStatus.COMPLETED) {
            orderStatus = OrderStatus.COMPLETED;
        }
        else if (sessionStatus === ChargingSessionStatus.INTERRUPTED) {
            orderStatus = OrderStatus.CANCELLED;
        }
        else {
            orderStatus = order['beckn:orderStatus'] as OrderStatus;
        }

        // Per schema line 2338-2340: when sessionStatus is ACTIVE, deliveryAttributes must include connectorType and maxPowerKW
        // Ensure these fields are preserved from update request or kept if already present
        const updatedDeliveryAttributes = {
            ...deliveryAttributes, // reuse everything from update request first (including connectorType and maxPowerKW if present)
            "@context": (deliveryAttributes?.['@context'] as string) || "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/main/schema/EvChargingSession/v1/context.jsonld",
            "@type": "ChargingSession" as const,
            'sessionStatus': sessionStatus, // only update sessionStatus
        };


        // Per schema (lines 2251-2360, 2556-2630): on_update should NOT include orderAttributes
        // Build order object explicitly, excluding orderAttributes
        const ubcOnUpdatePayload: UBCOnUpdateRequestPayload = {
            context: context,
            message: {
                order: {
                    "@context": order['@context'],
                    "@type": order['@type'],
                    "beckn:id": order['beckn:id'],
                    'beckn:orderStatus': orderStatus, // only update orderStatus
                    "beckn:seller": order['beckn:seller'],
                    "beckn:buyer": order['beckn:buyer'],
                    "beckn:orderItems": order['beckn:orderItems'],
                    "beckn:orderValue": order['beckn:orderValue'],
                    "beckn:payment": order['beckn:payment'],
                    'beckn:fulfillment': {
                        ...fulfillment, // reuse everything from update request first
                        "@context": fulfillment?.['@context'] || "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/main/schema/core/v2/context.jsonld",
                        "@type": fulfillment?.['@type'] || "beckn:Fulfillment",
                        "beckn:id": fulfillment?.['beckn:id'] || `fulfillment-${order['beckn:id']}`,
                        "beckn:mode": fulfillment?.['beckn:mode'] || "RESERVATION",
                        'beckn:deliveryAttributes': updatedDeliveryAttributes,
                    },
                },
            },
        };

        // Conditionally include order_value if present in backend response
        if (ExtractedOnUpdateResponseBody?.order_value) {
            ubcOnUpdatePayload.message.order['beckn:orderValue'] = ExtractedOnUpdateResponseBody.order_value;
        }

        return ubcOnUpdatePayload;
    }

    /**
     * Sends on_update response to beckn-ONIX (BPP)
     * Internet <- BPP's beckn-ONIX <- BPP's provider (CPO)
     */
    static async sendOnUpdateCallToBecknONIX(payload: UBCOnUpdateRequestPayload): Promise<any> {
        const bppHost = Utils.getBPPClientHost();
        return await BppOnixRequestService.sendPostRequest(
            {
                url: `${bppHost}/${BecknAction.on_update}`,
                data: payload,
            },
            BecknDomain.EVChargingUBC
        );
    }

    static async sendErrorOnUpdateResponse(
        originalRequest: UBCUpdateRequestPayload,
        error: Error
    ): Promise<void> {
        // Create new context with action changed to 'on_update' (response action)
        const context = Utils.getBPPContext({
            ...originalRequest.context,
            action: BecknAction.on_update,
        });

        // Send back the same request payload, just change the action in context
        // This allows BAP to resolve the stitched response even on error
        const errorOnUpdatePayload: UBCOnUpdateRequestPayload = {
            context: context,
            message: originalRequest.message,
        };

        logger.debug(`🟡 Sending error on_update response due to processing failure`, {
            data: {
                messageId: context.message_id,
                error: error.message,
            },
        });

        // Send the error response to BPP ONIX, which will forward it to BAP
        await this.sendOnUpdateCallToBecknONIX(errorOnUpdatePayload);
    }
}
