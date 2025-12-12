import { BecknDomain } from "../../../enums/BecknDomain";
import { ChargingSessionStatus } from "../../../enums/ChargingSessionStatus";

export type ExtractedOnUpdateResponsePayload = {
    session_status: ChargingSessionStatus,
};
