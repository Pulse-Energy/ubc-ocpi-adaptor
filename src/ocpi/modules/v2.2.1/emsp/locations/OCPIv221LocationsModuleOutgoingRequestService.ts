import { Request } from "express";
import { HttpResponse } from "../../../../../types/responses";
import { OCPILocationResponse, OCPILocationsResponse } from "../../../../schema/modules/locations/types/responses";
import OCPIResponseService from "../../../../services/OCPIResponseService";

/**
 * Handle all outgoing requests for the Locations module to the CPO
 */
export default class OCPIv221LocationsModuleOutgoingRequestService {
    public static async sendGetLocations(req: Request): Promise<HttpResponse<OCPILocationsResponse>> {
        return OCPIResponseService.success([]);
    }

    public static async sendGetLocation(req: Request): Promise<HttpResponse<OCPILocationResponse>> {
        return OCPIResponseService.success(undefined);
    }
    
}