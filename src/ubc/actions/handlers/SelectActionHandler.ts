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
import { EvseConnectorDbService } from '../../../db-services/EvseConnectorDbService';
import { OCPIv211PriceComponent, OCPIv211TariffElement } from '../../../ocpi/schema/modules/tariffs/types';
import { Tariff } from '@prisma/client';
import { TariffDbService } from '../../../db-services/TariffDbService';

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
                seller_id: payload.message.order['beckn:seller'],
                charge_point_connector_id:
                    payload.message.order['beckn:orderItems'][0]['beckn:orderedItem'],
                charging_option_type: UBCChargingMethod.Units,
                charging_option_unit: (
                    payload.message.order['beckn:orderItems'][0]['beckn:quantity']['unitQuantity'] *
                    1000
                ).toString(),
            },
        };
        return backendSelectPayload;
    }

    public static async sendSelectCallToBackend(
        payload: ExtractedSelectRequestBody
    ): Promise<ExtractedOnSelectResponseBody> {
        // const backendHost = Utils.getCPOBackendHostBasePath();
        // const response = await CPOBackendRequestService.sendPostRequest({
        //     url: `${backendHost}/${BecknAction.select}`,
        //     data: payload,
        //     headers: {},
        // });
        // return response.data as ExtractedOnSelectResponseBody;
        const reqPayload = payload.payload;
        const {
            seller_id,
            charge_point_connector_id,
            charging_option_type,
            charging_option_unit,
            tariff,
            charge_point_connector_type,
            power_rating,
        } = reqPayload;
        const chargingOptionUnit = Number(charging_option_unit)/1000; // Convert kWh to Wh
        const evseConnector = await EvseConnectorDbService.getById(
            charge_point_connector_id
        );
        if (!evseConnector) {
            throw new Error('EVSE Connector not found');
        }

        const ocpiTariff = await TariffDbService.getByOcpiTariffId(evseConnector.tariff_ids[0]);
        if (!ocpiTariff) {
            throw new Error('Tariff not found for EVSE Connector');
        }

        const orderValue = SelectActionHandler.buildOrderValue(ocpiTariff, chargingOptionUnit);

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
        // const price = ExtractedOnSelectResponseBody.payload['beckn:price'];

        const context = Utils.getBPPContext({
            ...backendSelectPayload.context,
            action: BecknAction.on_select,
        });

        const ubcOnSelectPayload: UBCOnSelectRequestPayload = {
            context: context,
            message: {
                order: {
                    ...backendSelectPayload.message.order,
                    'beckn:orderStatus': OrderStatus.PENDING,
                    'beckn:orderValue': orderValue,
                    'beckn:orderItems': [
                        {
                            'beckn:lineId':
                                backendSelectPayload.message.order['beckn:orderItems'][0][
                                    'beckn:lineId'
                                ],
                            'beckn:orderedItem':
                                backendSelectPayload.message.order['beckn:orderItems'][0][
                                    'beckn:orderedItem'
                                ],
                            'beckn:quantity':
                                backendSelectPayload.message.order['beckn:orderItems'][0][
                                    'beckn:quantity'
                                ],
                            'beckn:acceptedOffer':
                                backendSelectPayload.message.order['beckn:orderItems'][0][
                                    'beckn:acceptedOffer'
                                ],
                            // 'beckn:price': price,
                        },
                    ],
                    'beckn:fulfillment': {
                        '@context':
                            'https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld',
                        '@type': ObjectType.fulfillment,
                        'beckn:id': 'fulfillment-charging-001',
                        'beckn:mode': 'RESERVATION',
                        'beckn:deliveryAttributes': {
                            '@context':
                                'https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/EvChargingSession/v1/context.jsonld',
                            '@type': ObjectType.chargingSession,
                            sessionStatus: ChargingSessionStatus.PENDING,
                            authorizationMode: 'APP_QR',
                            authorizationOtpHint: 'Scan QR code at charging station',
                            connectorType: ExtractedOnSelectResponseBody.payload.connector_type,
                            maxPowerKW: ExtractedOnSelectResponseBody.payload.power_rating,
                            reservationId: '',
                            gracePeriodMinutes: 10,
                            trackingId: '',
                            trackingUrl: '',
                            trackingStatus: '',
                        },
                    },
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
                type: OrderValueComponentsType.FEE,
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

        return components;
    }

    private static buildOrderValue(tariff: Tariff, chargingOptionUnit: number): BecknOrderValueResponse {
        const tariffElement = {
            ocpi_tariff_element: tariff.ocpi_tariff_element as any as OCPIv211TariffElement[],
            max_price: tariff.max_price,
            currency: tariff.currency,
        };
        const ocpiTariffElement = tariffElement.ocpi_tariff_element[0];
        const priceComponents = ocpiTariffElement.price_components as OCPIv211PriceComponent[];

        const chargingSessionCost = priceComponents.reduce((acc: number, curr: OCPIv211PriceComponent) => acc + (curr.price * chargingOptionUnit) + (curr.vat ? (curr.price * chargingOptionUnit) * (curr.vat / 100) : 0), 0);

        const gst = chargingSessionCost * 0.18;
        const serviceCharge = chargingSessionCost * 0.05;
        const total = chargingSessionCost + gst + serviceCharge;
        const orderValueComponents = SelectActionHandler.buildOrderValueComponents({
            charging_session_cost: chargingSessionCost,
            gst: gst, 
            service_charge: serviceCharge,
        });
        return {
            currency: tariffElement.currency,
            value: total,
            components: orderValueComponents,
        };
    }   
}
