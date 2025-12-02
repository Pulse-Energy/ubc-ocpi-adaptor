import { Request } from "express";
import { HttpResponse } from "../../../../../types/responses";
import { OCPICDRResponse, OCPICDRsResponse } from "../../../../schema/modules/cdrs/types/responses";
import OCPIResponseService from "../../../../services/OCPIResponseService";

/**
 * Handle all incoming requests for the CDRs module from the CPO
 */
export default class OCPIv221CDRsModuleIncomingRequestService {

    // get requests

    public static async handleGetCDRs(req: Request): Promise<HttpResponse<OCPICDRsResponse>> {
        return OCPIResponseService.success([]);
    }

    public static async handleGetCDR(req: Request): Promise<HttpResponse<OCPICDRResponse>> {
        return OCPIResponseService.success(undefined);
    }

    // post requests

    public static async handlePostCDR(req: Request): Promise<HttpResponse<OCPICDRResponse>> {
        return OCPIResponseService.success(undefined);
    }

}

