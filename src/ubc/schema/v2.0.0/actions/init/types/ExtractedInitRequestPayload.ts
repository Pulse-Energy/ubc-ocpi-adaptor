import { UBCChargingMethod } from "../../../enums/UBCChargingMethod";
import { BuyerDetails } from "../../../types/BuyerDetails";
import { BecknRequestMetadata } from "../../select/types/ExtractedSelectRequestBody";

export type ExtractedInitRequestPayload = {
    charge_point_connector_id: string,
    charging_option_type: UBCChargingMethod,
    charging_option_unit: string,
    buyer_details?: BuyerDetails,
    amount: number,
};

export type ExtractedInitRequestBody = {
    metadata: BecknRequestMetadata,
    payload: ExtractedInitRequestPayload,
}


export type GeneratePaymentLinkRequestPayload = {
    amount: number,
    authorization_reference: string,
};  