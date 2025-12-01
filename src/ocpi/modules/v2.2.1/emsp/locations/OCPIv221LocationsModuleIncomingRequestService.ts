import { Request } from "express";
import { HttpResponse } from "../../../../../types/responses";
import { OCPIConnectorResponse, OCPIConnectorsResponse, OCPIEVSEResponse, OCPIEVSEsResponse, OCPILocationResponse, OCPILocationsResponse } from "../../../../schema/modules/locations/types/responses";
import OCPIResponseService from "../../../../services/OCPIResponseService";

/**
 * Handle all incoming requests for the Locations module from the CPO
 */
export default class OCPIv221LocationsModuleIncomingRequestService {

    // get requests

    public static async handleGetLocations(req: Request): Promise<HttpResponse<OCPILocationsResponse>> {
        return OCPIResponseService.success([]);
    }

    public static async handleGetEVSE(req: Request): Promise<HttpResponse<OCPIEVSEsResponse>> {
        return OCPIResponseService.success([]);
    }

    public static async handleGetConnector(req: Request): Promise<HttpResponse<OCPIConnectorsResponse>> {
        return OCPIResponseService.success([]);
    }

    // put requests

    public static async handlePutLocation(req: Request): Promise<HttpResponse<OCPILocationResponse>> {
        return OCPIResponseService.success(undefined);
    }

    public static async handlePutEVSE(req: Request): Promise<HttpResponse<OCPIEVSEsResponse>> {
        return OCPIResponseService.success([]);
    }

    public static async handlePutConnector(req: Request): Promise<HttpResponse<OCPIConnectorsResponse>> {
        return OCPIResponseService.success([]);
    }

    // patch requests

    public static async handlePatchLocation(req: Request): Promise<HttpResponse<OCPILocationResponse>> {
        return OCPIResponseService.success(undefined);
    }

    public static async handlePatchEVSE(req: Request): Promise<HttpResponse<OCPIEVSEResponse>> {
        return OCPIResponseService.success(undefined);
    }

    public static async handlePatchConnector(req: Request): Promise<HttpResponse<OCPIConnectorResponse>> {
        return OCPIResponseService.success(undefined);
    }

}