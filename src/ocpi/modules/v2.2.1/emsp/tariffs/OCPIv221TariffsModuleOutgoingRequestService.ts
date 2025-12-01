import { Request, Response } from "express";
import { HttpResponse } from "../../../../../types/responses";
import { OCPITariffResponse, OCPITariffsResponse } from "../../../../schema/modules/tariffs/types/responses";
import OCPIResponseService from "../../../../services/OCPIResponseService";
import { randomUUID } from "crypto";
import OCPIOutgoingRequestService from "../../../../services/OCPIOutgoingRequestService";
import OCPIGenericService from "../../../../services/OCPIGenericService";

/**
 * Handle all outgoing requests for the Tariffs module to the CPO
 */
export default class OCPIv221TariffsModuleOutgoingRequestService {
    public static async sendGetTariffs(req: Request): Promise<HttpResponse<OCPITariffsResponse>> {
        return OCPIResponseService.success([]);
    }

    public static async sendGetTariff(req: Request): Promise<HttpResponse<OCPITariffResponse>> {
        return OCPIResponseService.success(undefined);
    }

    private async sendGetTariff(requestURL: string, authToken: string, res?: Response, requestId: string = '', correlationId: string = ''): Promise<any> {
        if (!requestId) {
            requestId = randomUUID();
        }

        if (!correlationId) {
            correlationId = randomUUID();
        }

        return OCPIOutgoingRequestService.sendGetRequest({
            url: requestURL,
            headers: {
                'Authorization': OCPIOutgoingRequestService.getAuthorizationHeader(requestURL, authToken),
                ...OCPIGenericService.getGenericEMSPHeader(requestId, correlationId),
            },
        }, res)
            .then((response) => response)
            .catch((e) => e);
    }
}

