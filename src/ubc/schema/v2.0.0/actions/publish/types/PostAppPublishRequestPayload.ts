/**
 * Request payload for publish action from CPO/App
 * Based on Catalog Publish API requirements
 * Updated to accept ocpi_location_ids array - all location, EVSE, connector, and tariff data will be fetched from database
 * BPP ID, BPP URI, and transaction ID are automatically generated from config
 */
export type PostAppPublishRequestPayload = {
    /** Required: Array of OCPI Location IDs - all location, EVSE, connector, and tariff data will be fetched from database */
    ocpi_location_ids: string[];
    /** Optional: Accepted payment methods (defaults to [UPI, BANK_TRANSFER] if not provided) */
    accepted_payment_methods?: string[];
    /** Optional: Catalog validity period (defaults to tariff validity dates if not provided) */
    validity?: {
        /** Required: Start date (ISO 8601 date format) */
        start_date: string;
        /** Required: End date (ISO 8601 date format) */
        end_date: string;
    };
    /** Optional: Availability windows for items (defaults to 30 days from today if not provided) */
    availability_windows?: Array<{
        /** Start time in ISO 8601 format with offset (e.g., "2026-01-04T06:00:00+05:30") */
        start_time: string;
        /** End time in ISO 8601 format with offset (e.g., "2026-01-04T22:00:00+05:30") */
        end_time: string;
    }>;
    /** Optional: Whether items are active (defaults to true) */
    isActive?: boolean;
    /** Optional: Reservation time in seconds. If provided, excludes the period from now to now + reservationTime from availability windows */
    reservationTime?: number;
    /** Optional: Beckn connector ID (format: IND*TPC*{ocpi_location_id}*{evse_uid}*{connector_id}). If provided, only this connector will be published. */
    connector_id?: string;
};

