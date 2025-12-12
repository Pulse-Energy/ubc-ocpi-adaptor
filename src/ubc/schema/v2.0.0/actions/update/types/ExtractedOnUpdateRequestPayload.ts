import { ChargingSessionStatus } from "../../../enums/ChargingSessionStatus";
import { BecknRequestMetadata } from "../../select/types/ExtractedSelectRequestBody";


export type ExtractedOnUpdateRequestPayload = {
    metadata: BecknRequestMetadata,
    payload: {
        beckn_order_id: string,
        session_status: ChargingSessionStatus,
    },
};
