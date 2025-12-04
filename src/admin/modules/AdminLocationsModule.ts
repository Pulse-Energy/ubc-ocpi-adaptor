import { Request } from 'express';
import { HttpResponse } from '../../types/responses';
import { AdminResponsePayload } from '../types/responses';
import {
    OCPILocationResponse,
    OCPILocationsResponse,
} from '../../ocpi/schema/modules/locations/types/responses';
import OCPIv221LocationsModuleOutgoingRequestService from '../../ocpi/modules/v2.2.1/emsp/locations/OCPIv221LocationsModuleOutgoingRequestService';

export default class AdminLocationsModule {
    public static async sendGetLocations(
        req: Request
    ): Promise<HttpResponse<AdminResponsePayload<OCPILocationsResponse>>> {
        const ocpiResponse = await OCPIv221LocationsModuleOutgoingRequestService.sendGetLocations(req);

        return {
            httpStatus: ocpiResponse.httpStatus,
            headers: ocpiResponse.headers,
            payload: {
                data: ocpiResponse.payload,
            },
        };
    }

    public static async sendGetLocation(
        req: Request
    ): Promise<HttpResponse<AdminResponsePayload<OCPILocationResponse>>> {
        const ocpiResponse = await OCPIv221LocationsModuleOutgoingRequestService.sendGetLocation(req);

        return {
            httpStatus: ocpiResponse.httpStatus,
            headers: ocpiResponse.headers,
            payload: {
                data: ocpiResponse.payload,
            },
        };
    }
}