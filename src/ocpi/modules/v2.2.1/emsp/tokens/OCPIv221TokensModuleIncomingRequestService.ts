import { Request } from "express";
import { HttpResponse } from "../../../../../types/responses";
import { OCPIAuthorizationInfoResponse, OCPITokenResponse, OCPITokensResponse } from "../../../../schema/modules/tokens/types/responses";
import OCPIResponseService from "../../../../services/OCPIResponseService";

/**
 * Handle all incoming requests for the Tokens module from the CPO
 */
export default class OCPIv221TokensModuleIncomingRequestService {

    // get requests

    public static async handleGetTokens(req: Request): Promise<HttpResponse<OCPITokensResponse>> {
        return OCPIResponseService.success([]);
    }

    public static async handleGetToken(req: Request): Promise<HttpResponse<OCPITokenResponse>> {
        return OCPIResponseService.success(undefined);
    }

    // post requests

    public static async handlePostAuthorizeToken(req: Request): Promise<HttpResponse<OCPIAuthorizationInfoResponse>> {
        return OCPIResponseService.success(undefined);
    }

    // put requests

    public static async handlePutToken(req: Request): Promise<HttpResponse<OCPITokenResponse>> {
        return OCPIResponseService.success(undefined);
    }

    // patch requests

    public static async handlePatchToken(req: Request): Promise<HttpResponse<OCPITokenResponse>> {
        return OCPIResponseService.success(undefined);
    }

}

