import { Request } from "express";
import { HttpResponse } from "../../../../../types/responses";
import { OCPISessionResponse, OCPISessionsResponse } from "../../../../schema/modules/sessions/types/responses";
import OCPIResponseService from "../../../../services/OCPIResponseService";

/**
 * Handle all outgoing requests for the Sessions module to the CPO
 */
export default class OCPIv221SessionsModuleOutgoingRequestService {
    public static async sendGetSessions(req: Request): Promise<HttpResponse<OCPISessionsResponse>> {
        return OCPIResponseService.success([]);
    }

    public static async sendGetSession(req: Request): Promise<HttpResponse<OCPISessionResponse>> {
        return OCPIResponseService.success(undefined);
    }
}

