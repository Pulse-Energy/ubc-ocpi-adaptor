import { Request } from "express";
import { HttpResponse } from "../../../../../types/responses";
import { OCPISessionResponse, OCPISessionsResponse } from "../../../../schema/modules/sessions/types/responses";
import OCPIResponseService from "../../../../services/OCPIResponseService";

/**
 * Handle all incoming requests for the Sessions module from the CPO
 */
export default class OCPIv221SessionsModuleIncomingRequestService {

    // get requests

    public static async handleGetSessions(req: Request): Promise<HttpResponse<OCPISessionsResponse>> {
        return OCPIResponseService.success([]);
    }

    public static async handleGetSession(req: Request): Promise<HttpResponse<OCPISessionResponse>> {
        return OCPIResponseService.success(undefined);
    }

    // post requests

    public static async handlePostSession(req: Request): Promise<HttpResponse<OCPISessionResponse>> {
        return OCPIResponseService.success(undefined);
    }

    // put requests

    public static async handlePutSession(req: Request): Promise<HttpResponse<OCPISessionResponse>> {
        return OCPIResponseService.success(undefined);
    }

    // patch requests

    public static async handlePatchSession(req: Request): Promise<HttpResponse<OCPISessionResponse>> {
        return OCPIResponseService.success(undefined);
    }

}

