import { ChargingSessionStatus } from "../../../enums/ChargingSessionStatus";

export type ExtractedOnUpdateRequestBody = {
    beckn_order_id: string,
    session_status: ChargingSessionStatus,
    beckn_transaction_id: string,
    
};
