import { Request } from "express";
import { HttpResponse } from "../../../types/responses";
import { logger } from "../../../services/logger.service";
import UBCResponseService from "../../services/UBCResponseService";
import { UBCTrackRequestPayload } from "../../schema/v2.0.0/actions/track/types/TrackPayload";
import { BecknActionResponse } from "../../schema/v2.0.0/types/AckResponse";
import OnixBppController from "../../controller/OnixBppController";
import { BecknAction } from "../../schema/v2.0.0/enums/BecknAction";
import TrackActionService from "../services/TrackActionService";

/**
 * Handler for track action
 */
export default class TrackActionHandler {
    public static async handleTrack(req: Request): Promise<HttpResponse<BecknActionResponse>> {
        const payload = req.body as UBCTrackRequestPayload;

        return OnixBppController.requestWrapper(BecknAction.track, req, () => {
            TrackActionHandler.handleEVChargingUBCBppTrackAction(payload)
                .then((ubcOnTrackResponsePayload) => {
                    logger.debug(`🟢 Sending track response in handleTrack`, {
                        data: ubcOnTrackResponsePayload,
                    });
                })
                .catch((e: Error) => {
                    logger.error(
                        `🔴 Error in handleTrack: 'Something went wrong'`,
                        e,
                    );
                });
        });
    }

    public static async handleEVChargingUBCBppTrackAction(
        reqPayload: UBCTrackRequestPayload,
    ): Promise<void> {
        const reqId = reqPayload.context?.message_id || "unknown";
        const logData = { action: "track", messageId: reqId };

        try {
            logger.debug(
                `🟡 [${reqId}] Translating UBC to Backend payload in handleEVChargingUBCBppTrackAction`,
                { data: { logData, reqPayload } },
            );
            const backendTrackPayload =
                TrackActionService.translateUBCToBackendPayload(reqPayload);

            logger.debug(
                `🟡 [${reqId}] Building backend track response from sessions in handleEVChargingUBCBppTrackAction`,
                { data: { backendTrackPayload } },
            );
            const backendOnTrackResponsePayload =
                await TrackActionService.buildBackendTrackResponse(backendTrackPayload);

            logger.debug(
                `🟡 [${reqId}] Translating Backend to UBC payload in handleEVChargingUBCBppTrackAction`,
                { data: { reqPayload, backendOnTrackResponsePayload } },
            );
            const ubcOnTrackPayload = TrackActionService.translateBackendToUBC(
                reqPayload,
                backendOnTrackResponsePayload,
            );

            logger.debug(
                `🟡 [${reqId}] Sending on_track call to Beckn ONIX in handleEVChargingUBCBppTrackAction`,
                { data: { ubcOnTrackPayload } },
            );
            const response =
                await TrackActionService.sendOnTrackCallToBecknONIX(ubcOnTrackPayload);
            logger.debug(
                `🟢 [${reqId}] Sent on_track call to Beckn ONIX in handleEVChargingUBCBppTrackAction`,
                { data: { response } },
            );
        }
        catch (e: any) {
            logger.error(
                `🔴 [${reqId}] Error in handleEVChargingUBCBppTrackAction: ${e?.toString()}`,
                e,
                {
                    data: { logData },
                },
            );
            throw e;
        }
    }
}
