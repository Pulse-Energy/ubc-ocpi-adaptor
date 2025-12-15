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
import { EvseConnectorDbService } from '../../../db-services/EvseConnectorDbService';
import { OCPICommandResponseResponse } from '../../../ocpi/schema/modules/commands/types/responses';
import { OCPICommandResponseType } from '../../../ocpi/schema/modules/commands/enums';

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

            // translate CPO's BE Server response to UBC Schema
            logger.debug(
                `🟡 [${reqId}] Translating Backend to UBC payload in handleEVChargingUBCBppUpdateAction`,
                { data: { reqPayload, ExtractedOnUpdateResponseBody } }
            );
            const ubcOnUpdatePayload: UBCOnUpdateRequestPayload =
                UpdateActionHandler.translateBackendToUBC(
                    reqPayload,
                    ExtractedOnUpdateResponseBody
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

    public static translateUBCToBackendPayload(
        payload: UBCUpdateRequestPayload
    ): ExtractedUpdateRequestBody {
        const backendUpdatePayload: ExtractedUpdateRequestBody = {
            metadata: {
                domain: BecknDomain.EVChargingUBC,
                bpp_id: payload.context.bpp_id,
                bpp_uri: payload.context.bpp_uri,
                beckn_transaction_id: payload.context.transaction_id,
                bap_id: payload.context.bap_id,
                bap_uri: payload.context.bap_uri,
            },
            payload: {
                charge_point_connector_id:
                    payload.message.order['beckn:orderItems'][0]['beckn:orderedItem'],
                beckn_order_id: payload.message.order['beckn:orderNumber'],
                /**
                 * If the session status is pending or active, then start charging.
                 * If the session status is completed, then stop charging.
                 */
                charging_action:
                    payload.message.order['beckn:fulfillment']['beckn:deliveryAttributes'][
                        'sessionStatus'
                    ] === ChargingSessionStatus.PENDING ||
                    payload.message.order['beckn:fulfillment']['beckn:deliveryAttributes'][
                        'sessionStatus'
                    ] === ChargingSessionStatus.ACTIVE
                        ? ChargingAction.StartCharging
                        : ChargingAction.StopCharging,
            },
        };
        return backendUpdatePayload;
    }

    public static async sendUpdateCallToBackend(
        payload: ExtractedUpdateRequestBody
    ): Promise<ExtractedOnUpdateResponsePayload> {

        const { beckn_order_id, charging_action, charge_point_connector_id } = payload.payload;
        
        
        if (charging_action === ChargingAction.StartCharging) {
            const evseConnector = await EvseConnectorDbService.getById(charge_point_connector_id, {
                include: {
                    evse: {
                        select: {
                            partner_id: true,
                            evse_id: true,
                            location: {
                                select: {
                                    ocpi_location_id: true,
                                },
                            },
                        },
                    },
                },
            });
            if (!evseConnector) {
                throw new Error('EVSE Connector not found');
            }
    
            const req = {
                body: {
                    partner_id: evseConnector.partner_id,
                    location_id: evseConnector.evse?.location?.ocpi_location_id ?? '',
                    evse_uid: evseConnector.evse?.evse_id ?? '',
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
                        partner_id: evseConnector.partner_id,
                        location_id: evseConnector.evse?.location?.ocpi_location_id ?? '',
                        evse_uid: evseConnector.evse?.evse_id ?? '',
                        connector_id: charge_point_connector_id,
                        authorization_reference: beckn_order_id,
                    },
                });
            }
            const response = await AdminCommandsModule.startCharging(req);
            const ocpiCommandResponse = response.payload.data as OCPICommandResponseResponse;
            return {
                session_status: ocpiCommandResponse.data?.result === OCPICommandResponseType.ACCEPTED ? ChargingSessionStatus.ACTIVE : ChargingSessionStatus.COMPLETED,
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
                session_status: ocpiCommandResponse.data?.result === OCPICommandResponseType.ACCEPTED ? ChargingSessionStatus.COMPLETED : ChargingSessionStatus.INTERRUPTED,
            };
        }
        else {
            throw new Error('Invalid charging action');
        }
    }

    public static translateBackendToUBC(
        backendUpdatePayload: UBCUpdateRequestPayload,
        ExtractedOnUpdateResponseBody: ExtractedOnUpdateResponsePayload
    ): UBCOnUpdateRequestPayload {
        const context = Utils.getBPPContext({
            ...backendUpdatePayload.context,
            action: BecknAction.on_update,
        });

        const ubcOnUpdatePayload: UBCOnUpdateRequestPayload = {
            context: context,
            message: {
                order: {
                    ...backendUpdatePayload.message.order,
                    'beckn:orderStatus':
                        ExtractedOnUpdateResponseBody.session_status ===
                            ChargingSessionStatus.ACTIVE ||
                        ExtractedOnUpdateResponseBody.session_status ===
                            ChargingSessionStatus.COMPLETED
                            ? OrderStatus.COMPLETED
                            : backendUpdatePayload.message.order['beckn:orderStatus'],
                    'beckn:fulfillment': {
                        ...backendUpdatePayload.message.order['beckn:fulfillment'],
                        'beckn:deliveryAttributes': {
                            ...backendUpdatePayload.message.order['beckn:fulfillment'][
                                'beckn:deliveryAttributes'
                            ],
                            sessionStatus: ExtractedOnUpdateResponseBody.session_status,
                        },
                    },
                },
            },
        };
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
