import { Request } from "express";
import { HttpResponse } from "../../../../../types/responses";
import { OCPICommandResponseResponse } from "../../../../schema/modules/commands/types/responses";
import OCPIResponseService from "../../../../services/OCPIResponseService";

/**
 * Handle all outgoing requests for the Commands module to the CPO
 */
export default class OCPIv221CommandsModuleOutgoingRequestService {
    
    public static async sendStartSessionCommand() {

    }

    public static async sendStopSessionCommand() {
        
    }

    public static async sendUnlockConnectorCommand() {
        
    }

    public static async sendPostCommand(req: Request): Promise<HttpResponse<OCPICommandResponseResponse>> {
        return OCPIResponseService.success(undefined);
    }
}

