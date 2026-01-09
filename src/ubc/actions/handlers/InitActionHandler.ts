import { PaymentTxn, Prisma } from '@prisma/client';
import { Request } from 'express';
import { BecknDomain } from '../../schema/v2.0.0/enums/BecknDomain';
import { BecknActionResponse } from '../../schema/v2.0.0/types/AckResponse';
import { HttpResponse } from '../../../types/responses';
import OnixBppController from '../../controller/OnixBppController';
import { UBCInitRequestPayload } from '../../schema/v2.0.0/actions/init/types/InitPayload';
import { BecknAction } from '../../schema/v2.0.0/enums/BecknAction';
import { logger } from '../../../services/logger.service';
import { UBCOnInitRequestPayload } from '../../schema/v2.0.0/actions/init/types/OnInitPayload';
import BecknLogDbService from '../../../db-services/BecknLogDbService';
import {
    ExtractedInitRequestBody,
    GeneratePaymentLinkRequestPayload,
} from '../../schema/v2.0.0/actions/init/types/ExtractedInitRequestPayload';
import {
    ExtractedOnInitResponseBody,
    GeneratePaymentLinkResponsePayload,
} from '../../schema/v2.0.0/actions/init/types/ExtractedOnInitResponsePayload';
import { ObjectType } from '../../schema/v2.0.0/enums/ObjectType';
import BppOnixRequestService from '../../services/BppOnixRequestService';
import Utils from '../../../utils/Utils';
import { AcceptedPaymentMethod } from '../../schema/v2.0.0/enums/AcceptedPaymentMethod';
import { UBCChargingMethod } from '../../schema/v2.0.0/enums/UBCChargingMethod';
import CPOBackendRequestService from '../../services/CPOBackendRequestService';
import PaymentTxnDbService from '../../../db-services/PaymentTxnDbService';
import { BecknPaymentStatus } from '../../schema/v2.0.0/enums/PaymentStatus';
import { LocationDbService } from '../../../db-services/LocationDbService';
import OCPIPartnerDbService from '../../../db-services/OCPIPartnerDbService';
import { OCPIPartnerAdditionalProps, PaymentServiceProvider } from '../../../types/OCPIPartner';
import PaymentGatewayService from '../../services/PaymentServices/PaymentGatewayService';
import PublishActionService from '../services/PublishActionService';
import { databaseService } from '../../../services/database.service';

export default class InitActionHandler {
    public static async handleBppInitAction(
        req: Request
    ): Promise<HttpResponse<BecknActionResponse>> {
        const payload = req.body as UBCInitRequestPayload;

        return OnixBppController.requestWrapper(BecknAction.init, req, () => {
            InitActionHandler.handleEVChargingUBCBppInitAction(payload)
                .then((ubcOnInitResponsePayload: UBCOnInitRequestPayload) => {
                    logger.debug(`🟢 Sending select response in handleBppSelectRequest`, {
                        data: ubcOnInitResponsePayload,
                    });
                })
                .catch((e: Error) => {
                    logger.error(`🔴 Error in handleBppSelectRequest: 'Something went wrong'`, e);
                });
        });
    }

    public static async handleEVChargingUBCBppInitAction(
        reqPayload: UBCInitRequestPayload
    ): Promise<UBCOnInitRequestPayload> {
        const reqId = reqPayload.context?.message_id || 'unknown';
        const logData = { action: 'init', messageId: reqId };

        try {
            // translate BAP schema to CPO's BE server
            logger.debug(
                `🟡 [${reqId}] Translating UBC to Backend payload in handleEVChargingUBCBppInitAction`,
                { data: { logData, reqPayload } }
            );
            const backendInitPayload: ExtractedInitRequestBody =
                InitActionHandler.translateUBCToBackendPayload(reqPayload);

            // make a request to CPO BE server
            logger.debug(
                `🟡 [${reqId}] Sending init call to backend in handleEVChargingUBCBppInitAction`,
                { data: { backendInitPayload } }
            );
            const backendOnInitResponsePayload: ExtractedOnInitResponseBody =
                await InitActionHandler.createPaymentTxnDetails(backendInitPayload);
            logger.debug(
                `🟢 [${reqId}] Received init response from backend in handleEVChargingUBCBppInitAction`,
                { data: { backendOnInitResponsePayload } }
            );

            // translate CPO's BE Server response to UBC Schema
            logger.debug(
                `🟡 [${reqId}] Translating Backend to UBC payload in handleEVChargingUBCBppInitAction`,
                { data: { reqPayload, backendOnInitResponsePayload } }
            );
            const ubcOnInitPayload: UBCOnInitRequestPayload =
                InitActionHandler.translateBackendToUBC(reqPayload, backendOnInitResponsePayload);

            // Call BAP on_select
            logger.debug(
                `🟡 [${reqId}] Sending on_init call to Beckn ONIX in handleEVChargingUBCBppInitAction`,
                { data: { ubcOnInitPayload } }
            );
            const response = await InitActionHandler.sendOnInitCallToBecknONIX(ubcOnInitPayload);
            logger.debug(
                `🟢 [${reqId}] Sent on_init call to Beckn ONIX in handleEVChargingUBCBppInitAction`,
                { data: { response } }
            );

            // Publish catalog with 5 minute reservation after on_init (async, non-blocking)
            Utils.executeAsync(async () => {
                try {
                    const chargePointConnectorId = reqPayload.message?.order?.['beckn:orderItems']?.[0]?.['beckn:orderedItem'];
                    if (chargePointConnectorId) {
                        const evse = await LocationDbService.findEVSEByBecknConnectorId(chargePointConnectorId);
                        if (evse) {
                            const location = await databaseService.prisma.location.findUnique({
                                where: { id: evse.location_id },
                                select: { ocpi_location_id: true },
                            });
                            if (location?.ocpi_location_id) {
                                // Reserve for 5 minutes (300 seconds) - publish only this connector
                                await PublishActionService.publishWithReservation(
                                    location.ocpi_location_id,
                                    300, // 5 minutes
                                    chargePointConnectorId // Publish only this connector
                                );
                            }
                        }
                    }
                }
                catch (e: any) {
                    logger.error(`🔴 [${reqId}] Error publishing with reservation after on_init: ${e?.toString()}`, e);
                    // Don't throw - publish failures shouldn't block init
                }
            });

            return ubcOnInitPayload;
        } 
        catch (e: any) {
            logger.error(
                `🔴 [${reqId}] Error in UBCBppActionService.handleEVChargingUBCBppInitAction: ${e?.toString()}`,
                e,
                {
                    data: logData,
                }
            );

            throw e;
        }
    }

    public static async fetchExistingBppOnInitResponse(
        transactionId: string
    ): Promise<UBCOnInitRequestPayload | null> {
        /**
         * If beckn transaction id is provided, check if the on init response for this transaction id is already present in the database.
         * if yes, return the response from the database. if no, then proceed to the next step.
         */
        const becknLogs = await BecknLogDbService.getByFilters({
            where: {
                transaction_id: transactionId,
                action: `bpp.out.request.${BecknAction.on_init}`,
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
            return becknLogs.records[0].payload as UBCOnInitRequestPayload;
        }

        return null;
    }

    public static translateUBCToBackendPayload(
        payload: UBCInitRequestPayload
    ): ExtractedInitRequestBody {
        const buyer = payload.message.order['beckn:buyer'];
        const orderItem = payload.message.order['beckn:orderItems'][0];
        
        const backendInitPayload: ExtractedInitRequestBody = {
            metadata: {
                domain: BecknDomain.EVChargingUBC,
                bpp_id: payload.context.bpp_id,
                bpp_uri: payload.context.bpp_uri,
                beckn_transaction_id: payload.context.transaction_id,
                bap_id: payload.context.bap_id,
                bap_uri: payload.context.bap_uri,
            },
            payload: {
                amount: payload.message.order['beckn:orderValue']['value'],
                orderValueComponents: payload.message.order['beckn:orderValue']['components'],
                charge_point_connector_id: orderItem['beckn:orderedItem'],
                charging_option_type: UBCChargingMethod.Units,
                charging_option_unit: (
                    (orderItem['beckn:quantity']?.['unitQuantity'] ?? 0) *
                    1000
                ).toString(),
                // v0.9: Updated field names (displayName, telephone, taxID)
                buyer_details: {
                    id: buyer['beckn:id'],
                    name: buyer['beckn:displayName'], // v0.9: renamed from beckn:name
                    address: buyer['beckn:address'],
                    email: buyer['beckn:email'],
                    phone: buyer['beckn:telephone'], // v0.9: renamed from beckn:phone
                    tax_id: buyer['beckn:taxID'], // v0.9: renamed from beckn:taxId
                    organization_name:
                        buyer['beckn:organization']?.['descriptor']?.['name'],
                },
            },
        };
        return backendInitPayload;
    }

    public static async createPaymentTxnDetails(
        payload: ExtractedInitRequestBody
    ): Promise<ExtractedOnInitResponseBody> {
        const finalAmount = payload.payload.amount;
        
        // Find EVSE directly from Beckn connector ID
        const evse = await LocationDbService.findEVSEByBecknConnectorId(payload.payload.charge_point_connector_id);
        
        if (!evse) {
            throw new Error(`EVSE not found for ID: ${payload.payload.charge_point_connector_id}`);
        }

        // Get connector from EVSE
        const parsedConnectorId = LocationDbService.parseBecknConnectorId(payload.payload.charge_point_connector_id);
        const evseConnector = evse.evse_connectors.find(
            connector => connector.connector_id === parsedConnectorId.connectorId && !connector.deleted
        );
        
        if (!evseConnector) {
            throw new Error(`Connector not found for ID: ${payload.payload.charge_point_connector_id}`);
        }
        
        if (!evseConnector.partner_id) {
            throw new Error(`Connector ${payload.payload.charge_point_connector_id} does not have a partner_id`);
        }
        
        // Verify the partner exists
        const partner = await OCPIPartnerDbService.getById(evseConnector.partner_id);
        if (!partner) {
            throw new Error(`Partner not found for partner_id: ${evseConnector.partner_id}`);
        }
        
        const authorizationReference = Utils.generateUUID();
        const paymentStatus = BecknPaymentStatus.PENDING;
        const orderValueComponents = payload.payload.orderValueComponents;
        const paymentTxnData: Prisma.PaymentTxnUncheckedCreateInput = {
            authorization_reference: authorizationReference,
            amount: finalAmount,
            payment_link: '',
            payment_breakdown: {
                total: finalAmount,
                breakdown: orderValueComponents,
            },
            status: paymentStatus,
            requested_energy_units: payload.payload.charging_option_unit,
            partner_id: evseConnector.partner_id,
            beckn_transaction_id: payload.metadata.beckn_transaction_id,
        };
        const paymentTxn = await PaymentTxnDbService.create({
            data: paymentTxnData,
        });
        const generatePaymentLinkResponse =
            await InitActionHandler.generatePaymentLink(
                {
                    amount: finalAmount,
                    authorization_reference: authorizationReference,
                },
                paymentTxn
            );
        PaymentTxnDbService.update(paymentTxn.id, {
            payment_link: generatePaymentLinkResponse.payment_link,
            authorization_reference: generatePaymentLinkResponse.authorization_reference,
        });

        const extractedOnInitResponseBody: ExtractedOnInitResponseBody = {
            metadata: {
                domain: BecknDomain.EVChargingUBC,
            },
            payload: {
                becknPaymentId: paymentTxn.id,
                paymentLink: generatePaymentLinkResponse.payment_link,
                chargeTxnRef: paymentTxn.authorization_reference,
                paymentStatus: paymentStatus,
                becknOrderId: paymentTxn.authorization_reference,
                amount: finalAmount,
            },
        };
        return extractedOnInitResponseBody;
    }

    public static async generatePaymentLink(
        payload: GeneratePaymentLinkRequestPayload,
        paymentTxn: PaymentTxn
    ): Promise<GeneratePaymentLinkResponsePayload> {
        const ocpiPartner = await OCPIPartnerDbService.getById(paymentTxn.partner_id);
        if (!ocpiPartner) {
            throw new Error('OCPI partner not found');
        }
        const ocpiPartnerAdditionalProps =
            ocpiPartner?.additional_props as OCPIPartnerAdditionalProps;
        
        if (ocpiPartnerAdditionalProps?.payment_service_provider === PaymentServiceProvider.CPO) {
            return await this.sendGeneratePaymentLinkCallToBackend(payload, paymentTxn.partner_id);
        }
        else {
            const paymentGatewayOrder = await PaymentGatewayService.createPaymentGatewayOrder(paymentTxn, ocpiPartner);
            return {
                payment_link: paymentGatewayOrder.bill_desk?.payment_url || '',
                authorization_reference: paymentTxn.authorization_reference,
            };
        }
    }

    public static async sendGeneratePaymentLinkCallToBackend(
        payload: GeneratePaymentLinkRequestPayload,
        partnerId: string
    ): Promise<GeneratePaymentLinkResponsePayload> {

        const ocpiPartner = await OCPIPartnerDbService.getById(partnerId);
        const ocpiPartnerAdditionalProps =
            ocpiPartner?.additional_props as OCPIPartnerAdditionalProps;
        const generatePaymentLink =
            ocpiPartnerAdditionalProps?.communication_urls?.generate_payment_link;
        if (!generatePaymentLink) {
            throw new Error('Generate payment link endpoint not found');
        }
        const generatePaymentLinkUrl = generatePaymentLink.url;
        const generatePaymentLinkAuthToken = generatePaymentLink.auth_token;
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (generatePaymentLinkAuthToken) {
            headers['Authorization'] = `${generatePaymentLinkAuthToken}`;
        }
        const response = await CPOBackendRequestService.sendPostRequest({
            url: generatePaymentLinkUrl,
            data: payload,
            headers: headers,
        });
        
        return response.data as GeneratePaymentLinkResponsePayload;
    }

    public static translateBackendToUBC(
        backendInitPayload: UBCInitRequestPayload,
        backendOnInitResponsePayload: ExtractedOnInitResponseBody
    ): UBCOnInitRequestPayload {
        const context = Utils.getBPPContext({
            ...backendInitPayload.context,
            action: BecknAction.on_init,
        });

        const initOrder = backendInitPayload.message.order;

        // v0.9: OnInit response - removed orderNumber, orderAttributes, fulfillment
        // v0.9: Added beckn:id (order id), full payment with paymentURL, txnRef, acceptedPaymentMethod
        const ubcOnInitPayload: UBCOnInitRequestPayload = {
            context: context,
            message: {
                order: {
                    '@context': initOrder['@context'],
                    '@type': initOrder['@type'],
                    'beckn:id': backendOnInitResponsePayload.payload.becknOrderId, // v0.9: order id assigned by BPP
                    'beckn:orderStatus': initOrder['beckn:orderStatus'],
                    'beckn:seller': initOrder['beckn:seller'],
                    'beckn:buyer': initOrder['beckn:buyer'],
                    'beckn:orderItems': initOrder['beckn:orderItems'],
                    'beckn:orderValue': initOrder['beckn:orderValue'],
                    'beckn:payment': {
                        '@context':
                            'https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/main/schema/core/v2/context.jsonld',
                        '@type': ObjectType.payment,
                        'beckn:id': backendOnInitResponsePayload.payload.becknPaymentId,
                        'beckn:amount': {
                            currency: 'INR',
                            value: backendOnInitResponsePayload.payload.amount,
                        },
                        'beckn:paymentURL': backendOnInitResponsePayload.payload.paymentLink,
                        'beckn:txnRef': backendOnInitResponsePayload.payload.chargeTxnRef,
                        'beckn:beneficiary': backendOnInitResponsePayload.payload.beneficiary ?? 'BPP',
                        'beckn:acceptedPaymentMethod': [
                            AcceptedPaymentMethod.BANK_TRANSFER,
                            AcceptedPaymentMethod.UPI,
                            AcceptedPaymentMethod.WALLET,
                        ],
                        'beckn:paymentStatus': backendOnInitResponsePayload.payload.paymentStatus,
                        // v0.9: paymentAttributes with settlementAccounts - inherited from init request if present
                        'beckn:paymentAttributes': initOrder['beckn:payment']?.['beckn:paymentAttributes'],
                    },
                },
            },
        };
        return ubcOnInitPayload;
    }

    /**
     * Sends on_select response to beckn-ONIX (BPP)
     * Internet <- BPP's beckn-ONIX <- BPP's provider (CPO)
     */
    static async sendOnInitCallToBecknONIX(payload: UBCOnInitRequestPayload): Promise<any> {
        const bppHost = Utils.getBPPClientHost();
        return await BppOnixRequestService.sendPostRequest(
            {
                url: `${bppHost}/${BecknAction.on_init}`,
                data: payload,
            },
            BecknDomain.EVChargingUBC
        );
    }

    /**
     * Constructs and sends an error on_init response when processing fails.
     *
     * This function is called when an error occurs during the init action processing (e.g., backend call fails).
     * Instead of leaving the BAP side waiting indefinitely for a response, we send back the original request
     * payload with only the action changed to 'on_init'. This ensures:
     * 1. The BAP side receives a response and can resolve the stitched response
     * 2. The request doesn't get stuck in REQUESTS_STORE waiting for a callback
     * 3. The BAP can handle the error appropriately
     *
     * The error response flows: BPP → BPP ONIX → BAP ONIX → BAP → onActionsWrapper → resolveStitchedResponse
     *
     * @param originalRequest - The original init request payload received from BAP
     * @param error - The error that occurred during processing
     */
    static async sendErrorOnInitResponse(
        originalRequest: UBCInitRequestPayload,
        error: Error
    ): Promise<void> {
        // Create new context with action changed to 'on_init' (response action)
        const context = Utils.getBPPContext({
            ...originalRequest.context,
            action: BecknAction.on_init,
        });

        // Send back the same request payload, just change the action in context
        // This allows BAP to resolve the stitched response even on error
        const errorOnInitPayload = {
            context: context,
            message: originalRequest.message,
        } as unknown as UBCOnInitRequestPayload;

        logger.debug(`🟡 Sending error on_init response due to processing failure`, {
            data: {
                messageId: context.message_id,
                error: error.message,
            },
        });

        // Send the error response to BPP ONIX, which will forward it to BAP
        await this.sendOnInitCallToBecknONIX(errorOnInitPayload);
    }
}
