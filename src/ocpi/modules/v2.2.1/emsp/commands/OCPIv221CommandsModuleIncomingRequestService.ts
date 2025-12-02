import { Request } from "express";
import { HttpResponse } from "../../../../../types/responses";
import { OCPICommandResponseResponse } from "../../../../schema/modules/commands/types/responses";
import OCPIResponseService from "../../../../services/OCPIResponseService";

/**
 * Handle all incoming requests for the Commands module from the CPO
 */
export default class OCPIv221CommandsModuleIncomingRequestService {

    // post requests

    public static async handlePostCommand(req: Request): Promise<HttpResponse<OCPICommandResponseResponse>> {
        return OCPIResponseService.success(undefined);
    }

}

