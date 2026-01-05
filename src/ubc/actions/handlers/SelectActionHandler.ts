/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request } from 'express';
import { HttpResponse } from '../../../types/responses';
import { logger } from '../../../services/logger.service';
import { UBCSelectRequestPayload } from '../../schema/v2.0.0/actions/select/types/SelectPayload';
import { BecknActionResponse } from '../../schema/v2.0.0/types/AckResponse';
import { BecknAction } from '../../schema/v2.0.0/enums/BecknAction';
import Utils from '../../../utils/Utils';
import OnixBppController from '../../controller/OnixBppController';
import { UBCOnSelectRequestPayload } from '../../schema/v2.0.0/actions/select/types/OnSelectPayload';
import { ExtractedSelectRequestBody } from '../../schema/v2.0.0/actions/select/types/ExtractedSelectRequestBody';
import { ExtractedOnSelectResponseBody } from '../../schema/v2.0.0/actions/select/types/ExtractedOnSelectResponsePayload';
import { OrderStatus } from '../../schema/v2.0.0/enums/OrderStatus';
import { ObjectType } from '../../schema/v2.0.0/enums/ObjectType';
import { ChargingSessionStatus } from '../../schema/v2.0.0/enums/ChargingSessionStatus';
import { BecknDomain } from '../../schema/v2.0.0/enums/BecknDomain';
import { UBCChargingMethod } from '../../schema/v2.0.0/enums/UBCChargingMethod';
import BppOnixRequestService from '../../services/BppOnixRequestService';
import { OrderValueComponentsType } from '../../schema/v2.0.0/enums/OrderValueComponentsType';
import {
    BecknOrderValueComponents,
    BecknOrderValueResponse,
} from '../../schema/v2.0.0/types/OrderValue';
import { BecknOrderItemResponse } from '../../schema/v2.0.0/types/OrderItem';
import { EvseConnectorDbService } from '../../../db-services/EvseConnectorDbService';
import { OCPIv211PriceComponent, OCPIv211TariffElement } from '../../../ocpi/schema/modules/tariffs/types';
import { Tariff } from '@prisma/client';
import { TariffDbService } from '../../../db-services/TariffDbService';
import { LocationDbService } from '../../../db-services/LocationDbService';
import OCPIPartnerDbService from '../../../db-services/OCPIPartnerDbService';

/**
 * Handler for select action
 */
export default class SelectActionHandler {

    public static async handleBppSelectRequest(
        req: Request
    ): Promise<HttpResponse<BecknActionResponse>> {
        const payload = req.body as UBCSelectRequestPayload;

        return OnixBppController.requestWrapper(BecknAction.select, req, () => {
            SelectActionHandler.handleEVChargingUBCBppSelectAction(payload)
                .then((ubcOnSelectResponsePayload: UBCOnSelectRequestPayload) => {
                    logger.debug(`🟢 Sending select response in handleBppSelectRequest`, {
                        data: ubcOnSelectResponsePayload,
                    });
                })
                .catch((e: Error) => {
                    logger.error(`🔴 Error in handleBppSelectRequest: 'Something went wrong'`, e);
                });
        });
    }

    public static async handleEVChargingUBCBppSelectAction(
        reqPayload: UBCSelectRequestPayload
    ): Promise<UBCOnSelectRequestPayload> {
        const reqId = reqPayload.context?.message_id || 'unknown';
        const logData = { action: 'select', messageId: reqId };

        try {
            // translate BAP schema to CPO's BE server
            logger.debug(
                `🟡 [${reqId}] Translating UBC to Backend payload in handleEVChargingUBCBppSelectAction`,
                { data: { logData, reqPayload } }
            );
            const backendSelectPayload: ExtractedSelectRequestBody =
                SelectActionHandler.translateUBCToBackendPayload(reqPayload);

            // make a request to CPO BE server
            logger.debug(
                `🟡 [${reqId}] Sending select call to backend in handleEVChargingUBCBppSelectAction`,
                { data: { backendSelectPayload } }
            );
            const ExtractedOnSelectResponseBody: ExtractedOnSelectResponseBody =
                await SelectActionHandler.sendSelectCallToBackend(backendSelectPayload);
            logger.debug(
                `🟢 [${reqId}] Received select response from backend in handleEVChargingUBCBppSelectAction`,
                { data: { ExtractedOnSelectResponseBody } }
            );

            // translate CPO's BE Server response to UBC Schema
            logger.debug(
                `🟡 [${reqId}] Translating Backend to UBC payload in handleEVChargingUBCBppSelectAction`,
                { data: { reqPayload, ExtractedOnSelectResponseBody } }
            );
            const ubcOnSelectPayload: UBCOnSelectRequestPayload = SelectActionHandler.translateBackendToUBC(
                reqPayload,
                ExtractedOnSelectResponseBody
            );

            // Call BAP on_select
            logger.debug(
                `🟡 [${reqId}] Sending on_select call to Beckn ONIX in handleEVChargingUBCBppSelectAction`,
                { data: { ubcOnSelectPayload } }
            );
            const response = await SelectActionHandler.sendOnSelectCallToBecknONIX(ubcOnSelectPayload);
            logger.debug(
                `🟢 [${reqId}] Sent on_select call to Beckn ONIX in handleEVChargingUBCBppSelectAction`,
                { data: { response } }
            );

            // return the response
            return ubcOnSelectPayload;
        } 
        catch (e: any) {
            logger.error(
                `🔴 [${reqId}] Error in UBCBppActionService.handleEVChargingUBCBppSelectAction: ${e?.toString()}`,
                e,
                {
                    data: { logData },
                }
            );
            throw e;
        }
    }

    public static translateUBCToBackendPayload(
        payload: UBCSelectRequestPayload
    ): ExtractedSelectRequestBody {
        const order = payload.message.order;
        const orderItem = order['beckn:orderItems'][0];
        const orderRecord = order as Record<string, unknown>;
        const buyer = orderRecord['beckn:buyer'];
        const orderAttributes = order['beckn:orderAttributes'];

        // Initialize buyer_details object
        const buyer_details: Partial<{ name?: string; phone?: string; email?: string }> = {};
        if (buyer) {
            const buyerRecord = buyer as Record<string, unknown>;
            if (buyerRecord['beckn:displayName']) {
                buyer_details.name = buyerRecord['beckn:displayName'] as string;
            }
            if (buyerRecord['beckn:telephone']) {
                buyer_details.phone = buyerRecord['beckn:telephone'] as string;
            }
            if (buyerRecord['beckn:email']) {
                buyer_details.email = buyerRecord['beckn:email'] as string;
            }
        }

        // Initialize preferences object
        const preferences: { startTime?: string; endTime?: string } = {};
        const orderAttributesRecord = orderAttributes as Record<string, unknown>;
        const preferencesObj = orderAttributesRecord?.['preferences'] as { startTime?: string; endTime?: string } | undefined;
        if (preferencesObj) {
            if (preferencesObj.startTime) {
                preferences.startTime = preferencesObj.startTime;
            }
            if (preferencesObj.endTime) {
                preferences.endTime = preferencesObj.endTime;
            }
        }

        // Initialize buyerFinderFee object
        const buyerFinderFee: { feeType?: string; feeValue?: number } = {};
        const buyerFinderFeeObj = orderAttributesRecord?.['buyerFinderFee'] as { feeType?: string; feeValue?: number } | undefined;
        if (buyerFinderFeeObj) {
            if (buyerFinderFeeObj.feeType) {
                buyerFinderFee.feeType = buyerFinderFeeObj.feeType;
            }
            if (buyerFinderFeeObj.feeValue !== undefined) {
                buyerFinderFee.feeValue = buyerFinderFeeObj.feeValue;
            }
        }

        const backendSelectPayload: ExtractedSelectRequestBody = {
            metadata: {
                domain: BecknDomain.EVChargingUBC,
                bpp_id: payload.context.bpp_id,
                bpp_uri: payload.context.bpp_uri,
                beckn_transaction_id: payload.context.transaction_id,
                bap_id: payload.context.bap_id,
                bap_uri: payload.context.bap_uri,
            },
            payload: {
                seller_id: order['beckn:seller'],
                charge_point_connector_id: orderItem['beckn:orderedItem'],
                charging_option_type: UBCChargingMethod.Units,
                charging_option_unit: (orderItem['beckn:quantity']['unitQuantity'] * 1000).toString(),
                buyer_details: Object.keys(buyer_details).length > 0 ? buyer_details : undefined,
                preferences: Object.keys(preferences).length > 0 ? preferences : undefined,
                buyerFinderFee: Object.keys(buyerFinderFee).length > 0 ? buyerFinderFee : undefined,
            },
        };
        return backendSelectPayload;
    }

    /**
     * Parses the formatted Beckn connector ID
     * Format: IND*${sellerId}*${csId}*${cpId}*${connectorId}
     * Returns: { countryCode, sellerId, csId, cpId, connectorId }
     */
    private static parseBecknConnectorId(formattedId: string): {
        countryCode: string;
        sellerId: string;
        csId: string;
        cpId: string;
        connectorId: string;
    } {
        const parts = formattedId.split('*');
        if (parts.length !== 5) {
            throw new Error(`Invalid connector ID format: ${formattedId}. Expected format: IND*sellerId*csId*cpId*connectorId`);
        }
        return {
            countryCode: parts[0], // IND
            sellerId: parts[1],     // seller/party ID
            csId: parts[2],         // charging station ID (location OCPI ID)
            cpId: parts[3],         // charge point ID (EVSE UID)
            connectorId: parts[4],  // connector ID
        };
    }

    public static async sendSelectCallToBackend(
        payload: ExtractedSelectRequestBody
    ): Promise<ExtractedOnSelectResponseBody> {
        const reqPayload = payload.payload;
        const {
            seller_id,
            charge_point_connector_id,
            charging_option_type,
            charging_option_unit,
            tariff,
            charge_point_connector_type,
            power_rating,
            buyerFinderFee,
        } = reqPayload;
        const chargingOptionUnit = Number(charging_option_unit)/1000; // Convert kWh to Wh
        
        // Parse the formatted connector ID
        const parsedConnectorId = SelectActionHandler.parseBecknConnectorId(charge_point_connector_id);
        
        // Find connector using parsed values
        const evseConnector = await LocationDbService.findConnectorByLocationEvseAndConnectorId(
            parsedConnectorId.csId,      // location OCPI ID
            parsedConnectorId.cpId,      // EVSE UID
            parsedConnectorId.connectorId, // connector ID
        );
        
        if (!evseConnector) {
            throw new Error(`EVSE Connector not found for: ${charge_point_connector_id}`);
        }

        const ocpiTariff = await TariffDbService.getByOcpiTariffId(evseConnector.tariff_ids[0]);
        if (!ocpiTariff) {
            throw new Error('Tariff not found for EVSE Connector');
        }

        const orderValue = SelectActionHandler.buildOrderValue(ocpiTariff, chargingOptionUnit, buyerFinderFee);

        const response: ExtractedOnSelectResponseBody = {
            payload: {
                connector_type: charge_point_connector_type,
                power_rating: power_rating,
                'beckn:orderValue': orderValue,
            },
            metadata: {
                domain: BecknDomain.EVChargingUBC,
            },
        };
        return response;
    }

    public static translateBackendToUBC(
        backendSelectPayload: UBCSelectRequestPayload,
        ExtractedOnSelectResponseBody: ExtractedOnSelectResponseBody
    ): UBCOnSelectRequestPayload {
        const orderValue = ExtractedOnSelectResponseBody.payload['beckn:orderValue'];
        const selectOrder = backendSelectPayload.message.order;
        const selectOrderItem = selectOrder['beckn:orderItems'][0];
        const selectAcceptedOffer = selectOrderItem['beckn:acceptedOffer'];
        const backendPayloadData = ExtractedOnSelectResponseBody.payload as Record<string, unknown>;

        const context = Utils.getBPPContext({
            ...backendSelectPayload.context,
            action: BecknAction.on_select,
        });

        // Build order item response with price
        // Per schema: on_select orderItems should NOT include beckn:lineId
        const priceFromBackend = backendPayloadData['beckn:price'];
        const priceFromOffer = selectAcceptedOffer['beckn:price'];
        const orderItemResponse: Record<string, unknown> = {
            'beckn:orderedItem': selectOrderItem['beckn:orderedItem'], // reuse from select
            'beckn:quantity': selectOrderItem['beckn:quantity'], // reuse from select
            'beckn:acceptedOffer': {
                ...selectAcceptedOffer, // reuse from select (includes provider field)
            },
            'beckn:price': priceFromBackend || priceFromOffer || {}, // add price
        };
        
        // Get buyer from select order (it's in the request but not in the type definition)
        const selectOrderRecord = selectOrder as Record<string, unknown>;
        const buyer = selectOrderRecord['beckn:buyer'];
        
        // Per schema example (lines 1122-1232): on_select should NOT include beckn:id or beckn:fulfillment
        // Field order per schema: @context, @type, orderStatus, seller, buyer, orderItems, orderValue, orderAttributes
        const ubcOnSelectPayload: UBCOnSelectRequestPayload = {
            context: context,
            message: {
                order: {
                    "@context": selectOrder["@context"],
                    "@type": selectOrder["@type"],
                    "beckn:orderStatus": OrderStatus.CREATED,
                    "beckn:seller": selectOrder["beckn:seller"],
                    ...(buyer ? { "beckn:buyer": buyer as any } : {}), // include buyer if present
                    "beckn:orderItems": [orderItemResponse as any], // Cast to any since schema doesn't require lineId
                    "beckn:orderValue": orderValue,
                    "beckn:orderAttributes": selectOrder["beckn:orderAttributes"],
                    // Per schema: on_select should NOT include beckn:id or beckn:fulfillment
                },
            },
        };
        return ubcOnSelectPayload;
    }

    /**
     * Sends on_select response to beckn-ONIX (BPP)
     * Internet <- BPP's beckn-ONIX <- BPP's provider (CPO)
     */
    static async sendOnSelectCallToBecknONIX(payload: UBCOnSelectRequestPayload): Promise<any> {
        const bppHost = Utils.getBPPClientHost();
        return await BppOnixRequestService.sendPostRequest(
            {
                url: `${bppHost}/${BecknAction.on_select}`,
                data: payload,
            },
            BecknDomain.EVChargingUBC
        );
    }

    private static buildOrderValueComponents(
        estimatedChargingCost: {
            charging_session_cost: number,
            gst: number,
            service_charge: number,
            buyer_finder_fee?: number,
        },
    ): BecknOrderValueComponents[] {
        const components: BecknOrderValueComponents[] = [
            {
                type: OrderValueComponentsType.UNIT,
                value: estimatedChargingCost.charging_session_cost,
                currency: 'INR',
                description: 'Estimated charging cost',
            },
        ];

        if (estimatedChargingCost.gst) {
            components.push({
                type: OrderValueComponentsType.TAX,
                value: estimatedChargingCost.gst,
                currency: 'INR',
                description: 'GST',
            });
        }

        if (estimatedChargingCost.service_charge) {
            components.push({
                type: OrderValueComponentsType.FEE,
                value: estimatedChargingCost.service_charge,
                currency: 'INR',
                description: 'Service Charge',
            });
        }

        if (estimatedChargingCost.buyer_finder_fee) {
            components.push({
                type: OrderValueComponentsType.FEE,
                value: estimatedChargingCost.buyer_finder_fee,
                currency: 'INR',
                description: 'Buyer Finder Fee',
            });
        }

        return components;
    }

    private static buildOrderValue(
        tariff: Tariff, 
        chargingOptionUnit: number,
        buyerFinderFee?: { feeType?: string; feeValue?: number }
    ): BecknOrderValueResponse {
        const tariffElement = {
            ocpi_tariff_element: tariff.ocpi_tariff_element as any as OCPIv211TariffElement[],
            max_price: tariff.max_price,
            currency: tariff.currency,
        };
        const ocpiTariffElement = tariffElement.ocpi_tariff_element[0];
        const priceComponents = ocpiTariffElement.price_components as OCPIv211PriceComponent[];

        const chargingSessionCost = priceComponents.reduce((acc: number, curr: OCPIv211PriceComponent) => acc + (curr.price * chargingOptionUnit) + (curr.vat ? (curr.price * chargingOptionUnit) * (curr.vat / 100) : 0), 0);

        const serviceCharge = chargingSessionCost * 0.05;
        const buyerFinderFeeValue = buyerFinderFee?.feeValue || 0;
        const subtotal = chargingSessionCost + serviceCharge + buyerFinderFeeValue;
        const gst = subtotal * 0.18;
        const total = subtotal + gst;
        const orderValueComponents = SelectActionHandler.buildOrderValueComponents({
            charging_session_cost: chargingSessionCost,
            gst: gst, 
            service_charge: serviceCharge,
            buyer_finder_fee: buyerFinderFeeValue > 0 ? buyerFinderFeeValue : undefined,
        });
        return {
            currency: tariffElement.currency,
            value: total,
            components: orderValueComponents,
        };
    }   
}
