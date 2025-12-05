import { BecknDomain } from "../../../enums/BecknDomain";
import { UBCChargingMethod } from "../../../enums/UBCChargingMethod";

export type BecknRequestMetadata = {
    domain: BecknDomain,
    bpp_id: string,
    bpp_uri: string,
    beckn_transaction_id: string,
    bap_id?: string,
    bap_uri?: string,
}

export type ExtractedSelectRequestPayload = {
    seller_id: string,
    charge_point_connector_id: string,
    charging_option_type: UBCChargingMethod,
    charging_option_unit: string,
    tariff?: number, // Will be used to calculate the order value. If tariff is 10/kWh, then tariff will be 10
    charge_point_connector_type?: string,
    power_rating?: number,
};

export type ExtractedSelectRequestBody = {
    metadata: BecknRequestMetadata,
    payload: ExtractedSelectRequestPayload,
}
