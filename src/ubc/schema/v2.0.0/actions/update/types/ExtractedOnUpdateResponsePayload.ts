import { ChargingSessionStatus } from "../../../enums/ChargingSessionStatus";

export type ExtractedOnUpdateResponsePayload = {
    session_status: ChargingSessionStatus,
};
