import { Request } from "express";
import { HttpResponse } from "../../../../../types/responses";
import { OCPICDRResponse, OCPICDRsResponse } from "../../../../schema/modules/cdrs/types/responses";
import OCPIResponseService from "../../../../services/OCPIResponseService";

/**
 * Handle all outgoing requests for the CDRs module to the CPO
 */
export default class OCPIv221CDRsModuleOutgoingRequestService {
    public static async sendGetCDRs(req: Request): Promise<HttpResponse<OCPICDRsResponse>> {
        return OCPIResponseService.success([]);
    }

    public static async sendGetCDR(req: Request): Promise<HttpResponse<OCPICDRResponse>> {
        return OCPIResponseService.success(undefined);
    }
}

