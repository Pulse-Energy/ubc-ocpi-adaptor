import { Request } from "express";
import { HttpResponse } from "../../../../../types/responses";
import { OCPITariffResponse, OCPITariffsResponse } from "../../../../schema/modules/tariffs/types/responses";
import OCPIResponseService from "../../../../services/OCPIResponseService";

/**
 * Handle all incoming requests for the Tariffs module from the CPO
 */
export default class OCPIv221TariffsModuleIncomingRequestService {

    // get requests

    public static async handleGetTariffs(req: Request): Promise<HttpResponse<OCPITariffsResponse>> {
        return OCPIResponseService.success([]);
    }

    public static async handleGetTariff(req: Request): Promise<HttpResponse<OCPITariffResponse>> {
        return OCPIResponseService.success(undefined);
    }

    // put requests

    public static async handlePutTariff(req: Request): Promise<HttpResponse<OCPITariffResponse>> {
        return OCPIResponseService.success(undefined);
    }

}

