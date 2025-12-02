import { Request } from "express";
import { HttpResponse } from "../../../../../types/responses";
import { OCPITokenResponse, OCPITokensResponse } from "../../../../schema/modules/tokens/types/responses";
import OCPIResponseService from "../../../../services/OCPIResponseService";

/**
 * Handle all outgoing requests for the Tokens module to the CPO
 */
export default class OCPIv221TokensModuleOutgoingRequestService {
    public static async sendGetTokens(req: Request): Promise<HttpResponse<OCPITokensResponse>> {
        return OCPIResponseService.success([]);
    }

    public static async sendGetToken(req: Request): Promise<HttpResponse<OCPITokenResponse>> {
        return OCPIResponseService.success(undefined);
    }
}

