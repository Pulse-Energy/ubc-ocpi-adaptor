import { AcceptedPaymentMethod } from "../../../enums/AcceptedPaymentMethod";

/**
 * Request payload for publish action from CPO/App
 * Based on Catalog Publish API requirements
 */
export type PostAppPublishRequestPayload = {
    /** Required metadata for context building */
    metadata: {
        /** Required: BPP identifier */
        bpp_id: string;
        /** Required: BPP URI */
        bpp_uri: string;
        /** Required: Transaction identifier for tracking */
        beckn_transaction_id: string;
    };
    /** Required payload data */
    payload: {
        /** Required: Organization/provider information */
        org: {
            /** Required: Organization identifier */
            id: string;
            /** Required: Organization name */
            name: string;
        };
        /** Required: Array of charging stations (can be empty, but array is required) */
        charging_stations: Array<{
            /** Required: Charging station identifier */
            id: string;
            /** Required: Charging station name */
            name: string;
            /** Required: Latitude coordinate */
            latitude: number;
            /** Required: Longitude coordinate */
            longitude: number;
            /** Required: Street address */
            address: string;
            /** Required: City */
            city: string;
            /** Required: State/region */
            state: string;
            /** Required: Postal/ZIP code */
            pincode: string;
            /** Required: Country code */
            country: string;
            /** Required: Start time for availability (ISO 8601 time format) */
            start_time: string;
            /** Required: End time for availability (ISO 8601 time format) */
            end_time: string;
            /** Optional: Rating value (0-5) */
            rating_value?: number;
            /** Optional: Number of ratings */
            rating_count?: number;
            /** Optional: Type of parking available */
            parking_type?: string;
            /** Optional: List of amenities */
            amenities?: string[];
            /** Required: Array of connectors (can be empty, but array is required) */
            connectors: Array<{
                /** Required: Connector identifier */
                id: string;
                /** Required: Connector type (e.g., "CCS2", "CHAdeMO") */
                type: string;
                /** Required: Power rating in kW */
                power_rating: number;
                /** Optional: OCPP identifier */
                ocpp_id?: string;
                /** Optional: EVSE identifier */
                evse_id?: string;
                /** Optional: Connector ID */
                connector_id?: string;
                /** Optional: Power type (AC/DC) */
                power_type?: string;
                /** Optional: Connector format */
                connector_format?: string;
                /** Optional: Charging speed category */
                charging_speed?: string;
                /** Optional: Connector status */
                connector_status?: string;
            }>;
        }>;
        /** Required: Array of tariffs (can be empty, but array is required) */
        tariffs: Array<{
            /** Required: Tariff identifier */
            id: string;
            /** Required: Tariff name */
            name: string;
            /** Required: Currency code (e.g., "INR", "USD") */
            currency: string;
            /** Required: Price per unit (as string, will be parsed to number) */
            price: string;
            /** Optional: Finder fee percentage */
            finder_fee?: number;
        }>;
        /** Required: Array of accepted payment methods */
        accepted_payment_methods: AcceptedPaymentMethod[];
        /** Required: Catalog validity period */
        validity: {
            /** Required: Start date (ISO 8601 date format) */
            start_date: string;
            /** Required: End date (ISO 8601 date format) */
            end_date: string;
        };
        /** Optional: Catalog identifier (not currently used in implementation) */
        catalog_id?: string;
    };
};

