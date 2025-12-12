import { BecknDomain } from "../../../enums/BecknDomain";
import { ChargingSessionStatus } from "../../../enums/ChargingSessionStatus";

export type ExtractedOnUpdateResponsePayload = {
    session_status: ChargingSessionStatus,
};

export type ExtractedOnUpdateResponseBody = {
    metadata: {
        domain: BecknDomain,
    },
    payload: ExtractedOnUpdateResponsePayload,
};
