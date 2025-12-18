import axios from 'axios';
import { BecknAction } from '../../schema/v2.0.0/enums/BecknAction';
import { BecknDomain } from '../../schema/v2.0.0/enums/BecknDomain';
import { UBCVersion } from '../../schema/v2.0.0/enums/UBCVersion';
import { UBCPublishRequestPayload } from '../../schema/v2.0.0/actions/publish/types/PublishPayload';
import { UBCPublishResponsePayload } from '../../schema/v2.0.0/actions/publish/types/PublishResponsePayload';
import { PostAppPublishRequestPayload } from '../../schema/v2.0.0/actions/publish/types/PostAppPublishRequestPayload';
import Utils from '../../../utils/Utils';
import BppOnixRequestService from '../../services/BppOnixRequestService';
import { appConfig } from '../../../config/app.config';
import { logger } from '../../../services/logger.service';
import { BecknCatalog } from '../../schema/v2.0.0/types/Catalog';
import { BecknItem } from '../../schema/v2.0.0/types/Item';
import { BecknCatalogOffer } from '../../schema/v2.0.0/types/CatalogOffer';
import { BecknChargingServiceAttributes } from '../../schema/v2.0.0/types/ChargingService';
import { ObjectType } from '../../schema/v2.0.0/enums/ObjectType';
import { AcceptedPaymentMethod } from '../../schema/v2.0.0/enums/AcceptedPaymentMethod';

type Connector = PostAppPublishRequestPayload['payload']['charging_stations'][0]['connectors'][0];
type ChargingStation = PostAppPublishRequestPayload['payload']['charging_stations'][0];

/**
 * Service for handling publish action
 */
export default class PublishActionService {
    /**
     * Gets appropriate charging description based on connector type and power
     */
    private static getChargingDescription(connector: Connector): string {
        const powerType = connector.power_type || '';
        const isAC = powerType.toUpperCase() === 'AC';
        const isDC = powerType.toUpperCase() === 'DC';
        
        if (isAC) {
            return `AC Charger - ${connector.type} (${connector.power_rating}kW)`;
        }
        else if (isDC) {
            if (connector.power_rating >= 50) {
                return `DC Fast Charger - ${connector.type} (${connector.power_rating}kW)`;
            }
            return `DC Charger - ${connector.type} (${connector.power_rating}kW)`;
        }
        return `${connector.type} Charger (${connector.power_rating}kW)`;
    }

    /**
     * Gets appropriate long description based on connector type and power
     */
    private static getChargingLongDescription(connector: Connector): string {
        const powerType = connector.power_type || '';
        const isAC = powerType.toUpperCase() === 'AC';
        const isDC = powerType.toUpperCase() === 'DC';
        
        if (isAC) {
            return `AC charging station supporting ${connector.type} connector type with ${connector.power_rating}kW maximum power output. Suitable for overnight and extended charging sessions.`;
        }
        else if (isDC) {
            if (connector.power_rating >= 50) {
                return `Fast DC charging station supporting ${connector.type} connector type with ${connector.power_rating}kW maximum power output. Features advanced thermal management and smart charging capabilities for rapid charging.`;
            }
            return `DC charging station supporting ${connector.type} connector type with ${connector.power_rating}kW maximum power output. Features advanced thermal management and smart charging capabilities.`;
        }
        return `Charging station supporting ${connector.type} connector type with ${connector.power_rating}kW maximum power output. Features advanced thermal management and smart charging capabilities.`;
    }
    /**
     * Translates app publish payload to UBC format
     */
    public static translateAppPayloadToUBC(payload: PostAppPublishRequestPayload): UBCPublishRequestPayload {
        if (!payload) {
            throw new Error('Payload is required');
        }

        const { metadata } = payload;

        if (!metadata) {
            throw new Error('Metadata is required in payload');
        }

        if (!metadata.bpp_id || !metadata.bpp_uri || !metadata.beckn_transaction_id) {
            throw new Error('Metadata must contain bpp_id, bpp_uri, and beckn_transaction_id');
        }

        // For publish (BPP-only, goes to CDS), we create context without BAP info
        // Note: action is hardcoded as 'catalog_publish' for CDS API
        const context = Utils.getBPPContext({
            action: 'catalog_publish' as BecknAction,
            version: UBCVersion.v2_0_0,
            domain: BecknDomain.EVChargingUBC,
            timestamp: new Date().toISOString(),
            bpp_id: metadata.bpp_id,
            bpp_uri: metadata.bpp_uri,
            transaction_id: metadata.beckn_transaction_id,
            message_id: Utils.generateUUID(),
        });

        const catalogs = this.getCatalogsFromAppPayload(payload);

        const ubcPublishPayload: UBCPublishRequestPayload = {
            context: context,
            catalogs: catalogs,
        };

        return ubcPublishPayload;
    }

    /**
     * Builds item attributes for a single connector
     * Item attributes contain connector-level information
     */
    private static getItemAttributesFromConnector(
        connector: Connector,
        cs: ChargingStation
    ): BecknChargingServiceAttributes {
        const attributes: BecknChargingServiceAttributes = {
            "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/EvChargingService/v1/context.jsonld",
            "@type": "ChargingService",
            "connectorType": connector.type,
            "maxPowerKW": connector.power_rating,
            "minPowerKW": connector.power_rating,
            "socketCount": 1,
            "reservationSupported": false,
            "serviceLocation": {
                "@type": "beckn:Location",
                "geo": {
                    "type": "Point",
                    "coordinates": [
                        cs.longitude,
                        cs.latitude
                    ]
                },
                "address": {
                    "streetAddress": cs.address,
                    "addressLocality": cs.city,
                    "addressRegion": cs.state,
                    "postalCode": cs.pincode,
                    "addressCountry": cs.country
                }
            },
            "amenityFeature": cs.amenities || [],
        };

        // Only include optional fields if they have values (avoid undefined in JSON)
        if (connector.ocpp_id) attributes.ocppId = connector.ocpp_id;
        if (connector.evse_id) attributes.evseId = connector.evse_id;
        if (cs.parking_type) attributes.parkingType = cs.parking_type;
        if (connector.connector_id) attributes.connectorId = connector.connector_id;
        if (connector.power_type) attributes.powerType = connector.power_type;
        if (connector.connector_format) attributes.connectorFormat = connector.connector_format;
        if (connector.charging_speed) attributes.chargingSpeed = connector.charging_speed;
        if (connector.connector_status) attributes.stationStatus = connector.connector_status;

        return attributes;
    }

    private static getCatalogsFromAppPayload(payload: PostAppPublishRequestPayload): BecknCatalog[] {
        const { metadata, payload: appPayload } = payload;
        const { org, charging_stations, tariffs, accepted_payment_methods, validity } = appPayload;

        // Build items from connectors (one item per connector)
        const items: BecknItem[] = charging_stations.flatMap((cs) => {
            return cs.connectors.map((connector): BecknItem => {
                return {
                    "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
                    "@type": ObjectType.item,
                    "beckn:id": connector.id, // Connector external object uid (item is at connector level)
                    "beckn:descriptor": {
                        "@type": ObjectType.descriptor,
                        "schema:name": `${cs.name} - ${connector.type}`, // Connector-specific name
                        "beckn:shortDesc": this.getChargingDescription(connector), // Connector-specific description
                        "beckn:longDesc": this.getChargingLongDescription(connector), // Long description
                    },
                    "beckn:category": {
                        "@type": "schema:CategoryCode",
                        "schema:codeValue": "EVSE",
                        "schema:name": "EV Charging Service",
                    },
                    "beckn:availableAt": [
                        {
                            "@type": "beckn:Location",
                            "geo": {
                                type: "Point",
                                coordinates: [cs.longitude, cs.latitude],
                            },
                            "address": {
                                streetAddress: cs.address,
                                addressLocality: cs.city,
                                addressRegion: cs.state,
                                postalCode: cs.pincode,
                                addressCountry: cs.country,
                            },
                        },
                    ],
                    "beckn:availabilityWindow": [
                        {
                            "@type": ObjectType.timePeriod,
                            "schema:startTime": cs.start_time,
                            "schema:endTime": cs.end_time,
                        },
                    ],
                    "beckn:rateable": cs.rating_value && cs.rating_count ? true : false,
                    ...(cs.rating_value && cs.rating_count ? {
                        "beckn:rating": {
                            "@type": ObjectType.rating,
                            "beckn:ratingValue": Math.min(cs.rating_value, 5), // Must be <= 5
                            "beckn:ratingCount": Math.floor(cs.rating_count), // Must be integer
                        }
                    } : {}),
                    "beckn:isActive": true,
                    "beckn:networkId": [
                        "beckn.open",
                    ],
                    "beckn:provider": {
                        "beckn:id": org.id, // org external object uid
                        "beckn:descriptor": {
                            "@type": ObjectType.descriptor,
                            "schema:name": org.name, // org name
                        },
                    },
                    "beckn:itemAttributes": this.getItemAttributesFromConnector(connector, cs),
                };
            });
        });

        const itemIds = items.map((item) => item['beckn:id']);

        // Build offers from tariffs
        // Deduplicate offers with same price, currency, and validity to avoid duplicate offers
        const uniqueOffers = new Map<string, {
            tariff: typeof tariffs[0],
            itemIds: string[]
        }>();

        tariffs.forEach((tariff) => {
            // Create a unique key based on price, currency, name, and validity
            const offerKey = `${tariff.currency}_${tariff.price}_${tariff.name}_${validity.start_date}_${validity.end_date}`;
            
            if (!uniqueOffers.has(offerKey)) {
                // For new unique offer, include all items
                uniqueOffers.set(offerKey, {
                    tariff,
                    itemIds: [...itemIds]
                });
            }
        });

        // Build offers from unique tariffs
        const offers: BecknCatalogOffer[] = Array.from(uniqueOffers.values()).map((offerData, index): BecknCatalogOffer => {
            const { tariff } = offerData;
            return {
                "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
                "beckn:provider": {
                    "beckn:id": org.id, // org external object uid - must be object, not string
                    "beckn:descriptor": {
                        "@type": ObjectType.descriptor,
                        "schema:name": org.name,
                    },
                },
                "@type": ObjectType.offer,
                "beckn:id": `${tariff.id}_${index}`, // tariff external object uid
                "beckn:descriptor": {
                    "@type": ObjectType.descriptor,
                    "schema:name": tariff.name, // Tariff name
                },
                /**
                 * this has to map the item id i.e. beckn:id of the item
                 */
                "beckn:items": offerData.itemIds, // Connector external object uid (cpc_id from tariff)
                "beckn:price": {
                    "currency": tariff.currency,
                    "value": parseFloat(tariff.price), // tariff rate
                    "applicableQuantity": {
                        "unitText": "Kilowatt Hour",
                        "unitCode": "KWH",
                        "unitQuantity": 1,
                    },
                },
                "beckn:validity": {
                    "@type": ObjectType.timePeriod,
                    "schema:startDate": validity.start_date,
                    "schema:endDate": validity.end_date,
                },
                "beckn:acceptedPaymentMethod": accepted_payment_methods as AcceptedPaymentMethod[],
                "beckn:offerAttributes": {
                    "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/EvChargingOffer/v1/context.jsonld",
                    "@type": ObjectType.chargingOffer,
                    "buyerFinderFee": {
                        "feeType": "PERCENTAGE",
                        "feeValue": tariff.finder_fee || 0,
                    },
                },
            };
        });

        const catalogs: BecknCatalog[] = [
            {
                "@context": "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld",
                "@type": ObjectType.catalog,
                /**
                 * catalog id has to be consistent always
                 * We may have to use same catalog id for all CPOs
                 */
                "beckn:id": `pulse-energy-catalog-v1`,
                "beckn:descriptor": {
                    "@type": ObjectType.descriptor,
                    "schema:name": `${metadata.bpp_id} Charging Network`,
                    "beckn:shortDesc": "Comprehensive network of charging stations",
                },
                "beckn:validity": {
                    "@type": ObjectType.timePeriod,
                    "schema:startDate": validity.start_date,
                    "schema:endDate": validity.end_date,
                },
                "beckn:items": items,
                "beckn:offers": offers,
            },
        ];

        return catalogs;
    }

    /**
     * Sends publish request to CDS (ONIX)
     * BPP Provider → CDS
     */
    public static async sendPublishCallToCDS(payload: UBCPublishRequestPayload): Promise<UBCPublishResponsePayload> {
        const cdsHost = `${appConfig.cds.baseUrl}/beckn/v2`;
        
        logger.debug(`🟡 Sending publish request to CDS`, { 
            url: `${cdsHost}/${BecknAction.publish}`,
            transaction_id: payload.context.transaction_id 
        });

        // Send to CDS endpoint
        const response = await axios.post(`${cdsHost}/${BecknAction.publish}`, payload, {
            headers: {
                'Content-Type': 'application/json',
                ...(appConfig.cds.apiKey ? { Authorization: `Bearer ${appConfig.cds.apiKey}` } : {}),
            },
        });

        return response.data;
    }

    /**
     * Sends publish request to beckn-ONIX (BPP)
     * This is the function called by getStitchedResponse
     */
    public static async sendPublishCallToBecknONIX(payload: UBCPublishRequestPayload): Promise<UBCPublishResponsePayload> {
        const bppHost = Utils.getBPPClientHost();
        
        logger.debug(`🟡 Sending publish request to BPP ONIX`, { 
            url: `${bppHost}/${BecknAction.publish}`,
            transaction_id: payload.context.transaction_id 
        });

        return await BppOnixRequestService.sendPostRequest({
            url: `${bppHost}/${BecknAction.publish}`,
            data: payload,
        }, BecknDomain.EVChargingUBC);
    }
}

