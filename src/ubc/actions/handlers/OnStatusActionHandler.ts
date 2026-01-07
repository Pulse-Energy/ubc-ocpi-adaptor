import { Request } from "express";
import { HttpResponse } from "../../../types/responses";
import { logger } from "../../../services/logger.service";
import UBCResponseService from "../../services/UBCResponseService";
import { BecknActionResponse } from "../../schema/v2.0.0/types/AckResponse";
import Utils from "../../../utils/Utils";
import BppOnixRequestService from "../../services/BppOnixRequestService";
import { BecknDomain } from "../../schema/v2.0.0/enums/BecknDomain";
import { ExtractedOnStatusRequestBody } from "../../schema/v2.0.0/actions/status/types/ExtractedOnStatusRequestPayload";
import { UBCOnStatusRequestPayload } from "../../schema/v2.0.0/actions/status/types/OnStatusPayload";
import { BecknAction } from "../../schema/v2.0.0/enums/BecknAction";
import InitActionHandler from "./InitActionHandler";
import { UBCOnSelectRequestPayload } from "../../schema/v2.0.0/actions/select/types/OnSelectPayload";
import { UBCOnInitRequestPayload } from "../../schema/v2.0.0/actions/init/types/OnInitPayload";
import { OrderStatus } from "../../schema/v2.0.0/enums/OrderStatus";
import { ObjectType } from "../../schema/v2.0.0/enums/ObjectType";
import { BecknPayment } from "../../schema/v2.0.0/types/Payment";
import PaymentTxnDbService from "../../../db-services/PaymentTxnDbService";
import BecknLogDbService from "../../../db-services/BecknLogDbService";
import { Prisma } from "@prisma/client";
import { LocationDbService } from "../../../db-services/LocationDbService";
import { OCPIStatusMapper } from "../../utils/OCPIStatusMapper";
import { GenericPaymentTxnStatus } from "../../../types/BillDesk";

/**
 * Handler for status action
 */
export default class OnStatusActionHandler {
    public static async handleBppOnStatusRequest(reqDetails: Request): Promise<HttpResponse<BecknActionResponse>> {
        try {
            logger.debug(`🟡 Received on_status request in handleBppOnStatusRequest`, { data: reqDetails });

            const body = reqDetails.body as ExtractedOnStatusRequestBody;
            
            // Forward on_status to BPP ONIX (no response needed as request comes from backend)
            await OnStatusActionHandler.handleEVChargingUBCBppOnStatusAction(body);
            

            logger.debug(`🟢 Sending on_status response in handleBppOnStatusRequest`, { data: {} });

            return UBCResponseService.ack();
        }
        catch (e: any) {
            logger.error(`🔴 Error in handleBppOnStatusRequest`, e, {
                data: { message: 'Something went wrong' },
            });

            return UBCResponseService.nack();
        }
    }

    public static async handleEVChargingUBCBppOnStatusAction(reqPayload: ExtractedOnStatusRequestBody): Promise<void> {
        const { authorization_reference } = reqPayload;
        const logData = { action: 'on_status', authorization_reference: authorization_reference };

        try {
            // Forward on_status to BPP ONIX
            logger.debug(`🟡 [${authorization_reference}] Forwarding on_status to BPP ONIX in handleEVChargingUBCBppOnStatusAction`, { data: { logData, reqPayload } });
            const response = await OnStatusActionHandler.forwardOnStatusToBppOnix(reqPayload);
            logger.debug(`🟢 [${authorization_reference}] Forwarded on_status to BPP ONIX in handleEVChargingUBCBppOnStatusAction`, { data: { response } });
        }
        catch (e: any) {
            logger.error(`🔴 [${authorization_reference}] Error in OnStatusActionHandler.handleEVChargingUBCBppOnStatusAction: ${e?.toString()}`, e, {
                data: { logData },
            });
            throw e;
        }
    }

    /**
     * Translates backend async on_status payload to UBC format
     * This is for UNSOLICITED on_status sent by BPP (without preceding status request)
     * According to schema: formulate using data from on_select and on_init
     * - orderStatus: PENDING
     * - orderItems: simplified (with quantity and price from on_select)
     * - orderValue: from on_select
     * - payment: from on_init with updated paymentStatus
     * - order id: from on_init
     * - buyer, seller: from on_select
     * - fulfillment: includes connectorStatus from EVSE table
     */
    public static async translateBackendToUBC(
        existingOnSelectResponse: UBCOnSelectRequestPayload,
        existingOnInitResponse: UBCOnInitRequestPayload,
        backendOnStatusRequestPayload: ExtractedOnStatusRequestBody,
        transactionId: string
    ): Promise<UBCOnStatusRequestPayload> {
        const selectOrder = existingOnSelectResponse.message.order;
        const initOrder = existingOnInitResponse.message.order;
        const initPayment = initOrder['beckn:payment'];

        // Generate new context for async on_status
        const context = Utils.getBPPContext({
            domain: BecknDomain.EVChargingUBC,
            action: BecknAction.on_status,
            version: '2.0.0',
            transaction_id: transactionId,
            message_id: Utils.generateUUID(), // Generate new message_id for async callback
            bap_id: existingOnInitResponse.context.bap_id,
            bap_uri: existingOnInitResponse.context.bap_uri,
            bpp_id: existingOnInitResponse.context.bpp_id,
            bpp_uri: existingOnInitResponse.context.bpp_uri,
        });

        // Build simplified orderItems (only orderedItem for async on_status per schema)
        // Per schema line 5643-5646: async on_status orderItems should only have beckn:orderedItem
        const selectOrderItems = selectOrder['beckn:orderItems'] as Record<string, unknown>[];
        const orderItems = selectOrderItems.map(item => ({
            "beckn:orderedItem": item['beckn:orderedItem'] as string,
        }));

        // Build payment object with only necessary fields per schema
        const initPaymentData = initPayment as Record<string, unknown>;
        const paymentObject: Partial<BecknPayment> = {
            "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/main/schema/core/v2/context.jsonld",
            "@type": ObjectType.payment,
            "beckn:id": initPaymentData['beckn:id'] as string,
            "beckn:amount": initPaymentData['beckn:amount'] as BecknPayment['beckn:amount'],
            "beckn:paymentURL": initPaymentData['beckn:paymentURL'] as string,
            "beckn:txnRef": initPaymentData['beckn:txnRef'] as string,
            "beckn:beneficiary": initPaymentData['beckn:beneficiary'] as string,
            "beckn:paymentStatus": backendOnStatusRequestPayload.payment_status,
        };

        // Add paidAt only if present (conditional for BAP beneficiary)
        if (initPaymentData['beckn:paidAt']) {
            paymentObject['beckn:paidAt'] = initPaymentData['beckn:paidAt'] as string;
        }

        // Fetch connectorStatus from EVSE table
        let connectorStatus: string | undefined;
        const orderedItem = orderItems[0]?.['beckn:orderedItem'] as string;
        if (orderedItem) {
            try {
                // Find the EVSE directly from the Beckn connector ID
                const evse = await LocationDbService.findEVSEByBecknConnectorId(orderedItem);
                if (evse) {
                    // Map OCPI EVSE status to UBC connectorStatus
                    connectorStatus = OCPIStatusMapper.mapOCPIStatusToUBCConnectorStatus(evse.status);
                    logger.debug(`🟢 Fetched connector status from EVSE for async on_status`, { 
                        data: { 
                            ocpiStatus: evse.status,
                            ubcConnectorStatus: connectorStatus,
                            orderedItem,
                        } 
                    });
                }
            }
            catch (e: any) {
                logger.warn(`🟡 Could not fetch connector status from EVSE for async on_status: ${e?.toString()}`, { 
                    data: { orderedItem, error: e } 
                });
                // Continue without connectorStatus if EVSE lookup fails
            }
        }

        // Build fulfillment with deliveryAttributes including connectorStatus and sessionStatus
        // Per schema line 5690-5699: fulfillment should always be included in async on_status
        // Cast initOrder to any to access fulfillment (may not be in type definition)
        const initOrderRecord = initOrder as any;
        const initFulfillment = initOrderRecord['beckn:fulfillment'] as Record<string, unknown> | undefined;
        const deliveryAttributes = (initFulfillment?.['beckn:deliveryAttributes'] || {}) as Record<string, unknown>;
        
        // Update deliveryAttributes with connectorStatus from EVSE and ensure sessionStatus is present
        const updatedDeliveryAttributes = {
            "@context": deliveryAttributes['@context'] || "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/main/schema/EvChargingSession/v1/context.jsonld",
            "@type": deliveryAttributes['@type'] || "ChargingSession",
            ...deliveryAttributes,
            ...(connectorStatus ? { connectorStatus } : {}),
            // Ensure sessionStatus is present (from init fulfillment or default to PENDING)
            sessionStatus: deliveryAttributes['sessionStatus'] || 'PENDING',
        };

        // Always include fulfillment per schema
        const fulfillment = {
            "@context": initFulfillment?.['@context'] || "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/main/schema/core/v2/context.jsonld",
            "@type": initFulfillment?.['@type'] || "beckn:Fulfillment",
            "beckn:id": initFulfillment?.['beckn:id'] || `fulfillment-${initOrder['beckn:id']}`,
            "beckn:mode": initFulfillment?.['beckn:mode'] || "RESERVATION",
            ...(initFulfillment || {}),
            'beckn:deliveryAttributes': updatedDeliveryAttributes,
        };

        // Per schema line 5638-5641: buyer should only have beckn:id for async on_status
        const selectBuyer = selectOrder['beckn:buyer'] as Record<string, unknown> | undefined;
        const simplifiedBuyer = selectBuyer ? {
            "@context": selectBuyer['@context'] as string || "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/main/schema/core/v2/context.jsonld",
            "@type": selectBuyer['@type'] as string || "beckn:Buyer",
            "beckn:id": selectBuyer['beckn:id'] as string,
        } : {
            "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/main/schema/core/v2/context.jsonld",
            "@type": "beckn:Buyer",
            "beckn:id": "", // Fallback if buyer not found
        };

        const ubcOnStatusPayload: UBCOnStatusRequestPayload = {
            context: context,
            message: {
                order: {
                    "@context": initOrder['@context'],
                    "@type": ObjectType.order,
                    "beckn:id": initOrder['beckn:id'], // from on_init
                    "beckn:orderStatus": OrderStatus.PENDING, // Can be PENDING or INPROGRESS per schema
                    "beckn:seller": selectOrder['beckn:seller'], // from on_select
                    "beckn:buyer": simplifiedBuyer as any, // Simplified buyer (only id) per schema line 5638-5641
                    "beckn:orderItems": orderItems as any, // Only orderedItem per schema (line 5643-5646)
                    "beckn:orderValue": selectOrder['beckn:orderValue'], // from on_select
                    "beckn:fulfillment": fulfillment as any, // Always include fulfillment per schema (line 5690-5699)
                    "beckn:payment": paymentObject as BecknPayment, // from on_init with updated paymentStatus
                },
            },
        };

        return ubcOnStatusPayload;
    }

    /**
     * Receives ASYNC/UNSOLICITED on_status from backend and forwards to BPP ONIX
     * This is for cases like charging interruptions, payment completion, etc.
     * Backend → BPP Provider → BPP ONIX → BAP
     * 
     * No preceding status request is required - this is an independent callback
     */
    public static async forwardOnStatusToBppOnix(payload: ExtractedOnStatusRequestBody): Promise<void> {
        const { authorization_reference, payment_status, oldPaymentStatus } = payload;

        const paymentTxn = await PaymentTxnDbService.getFirstByFilter({
            where: {
                authorization_reference: authorization_reference,
            },
        });
        if (!paymentTxn) {
            throw new Error('No payment txn found');
        }
        const paymentStatus = paymentTxn.status;
        if (oldPaymentStatus === GenericPaymentTxnStatus.Success || paymentStatus === oldPaymentStatus) {
            return;
        }

        if (oldPaymentStatus !== GenericPaymentTxnStatus.Pending) {
            throw new Error('Payment txn is not pending');
        }

        const becknTransactionId = paymentTxn.beckn_transaction_id;

        // Fetch existing responses to formulate on_status payload
        const existingBppOnSelectResponse = await OnStatusActionHandler.fetchExistingBppOnSelectResponse(becknTransactionId);
        const existingBppOnInitResponse = await InitActionHandler.fetchExistingBppOnInitResponse(becknTransactionId);

        if (!existingBppOnSelectResponse) {
            throw new Error('No existing on_select response found');
        }

        if (!existingBppOnInitResponse) {
            throw new Error('No existing on_init response found');
        }

        // Update payment status in database
        PaymentTxnDbService.update(paymentTxn.id, {
            status: payment_status,
        });
        
       // v0.9: Use type assertion since on_init structure changed but we still need to build on_status from it
        // Convert backend payload to UBC format (no status request needed for async on_status)
        const ubcOnStatusPayload = await this.translateBackendToUBC(
            existingBppOnSelectResponse,
            existingBppOnInitResponse,
            payload,
            becknTransactionId
        );

        const bppHost = Utils.getBPPClientHost();

        return await BppOnixRequestService.sendPostRequest({
            url: `${bppHost}/${BecknAction.on_status}`,
            data: ubcOnStatusPayload,
        }, BecknDomain.EVChargingUBC);
    }

    public static async fetchExistingBppOnSelectResponse(transactionId: string): Promise<UBCOnSelectRequestPayload | null> {
        /**
         * Fetch existing on_select response for this transaction id
         */
        const becknLogs = await BecknLogDbService.getByFilters({
            where: {
                transaction_id: transactionId,
                action: `bpp.out.request.${BecknAction.on_select}`,
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
            return becknLogs.records[0].payload as UBCOnSelectRequestPayload;
        }

        return null;
    }
}

