import { Request } from 'express';
import { HttpResponse } from '../../../../../types/responses';
import {
    OCPILocationResponse,
    OCPILocationsResponse,
} from '../../../../schema/modules/locations/types/responses';
import OCPIResponseService from '../../../../services/OCPIResponseService';
import OCPIOutgoingRequestService from '../../../../services/OCPIOutgoingRequestService';
import Utils from '../../../../../utils/Utils';
import { OCPILogCommand } from '../../../../types';

/**
 * Handle all outgoing requests for the Locations module to the CPO.
 *
 * This service is OCPI/EMSP–centric and is reused by the admin layer,
 * so that all OCPI-specific logic lives in one place.
 */
export default class OCPIv221LocationsModuleOutgoingRequestService {
    public static async sendGetLocations(
        req: Request,
        cpoAuthToken: string | undefined,
        partnerId?: string,
    ): Promise<HttpResponse<OCPILocationsResponse>> {
        if (!cpoAuthToken) {
            return OCPIResponseService.clientError<unknown>({
                message: 'CPO auth token is required',
            }) as HttpResponse<OCPILocationsResponse>;
        }

        try {
            const baseUrl = await Utils.getOcpiEndpoint('locations', 'SENDER', partnerId);

            const limit = req.query.limit ? Number(req.query.limit) : undefined;
            const offset = req.query.offset ? Number(req.query.offset) : undefined;

            const params = new globalThis.URLSearchParams();
            if (typeof limit === 'number' && !Number.isNaN(limit)) {
                params.append('limit', limit.toString());
            }
            if (typeof offset === 'number' && !Number.isNaN(offset)) {
                params.append('offset', offset.toString());
            }

            const url = params.toString() ? `${baseUrl}?${params.toString()}` : baseUrl;
            const response = await OCPIOutgoingRequestService.sendGetRequest({
                url,
                headers: {
                    Authorization: OCPIOutgoingRequestService.getAuthorizationHeader(
                        url,
                        cpoAuthToken,
                    ),
                },
                partnerId,
                command: OCPILogCommand.SendGetLocationReq,
            });

            const payload = response.data as OCPILocationsResponse;

            if (!payload || !payload.data || !Array.isArray(payload.data)) {
                return OCPIResponseService.clientError<unknown>({
                    message: 'Invalid response format from CPO locations endpoint',
                }) as HttpResponse<OCPILocationsResponse>;
            }

            return {
                httpStatus: 200,
                payload,
            };
        }
        catch (error) {
            return OCPIResponseService.serverError<unknown>({
                message: 'Failed to fetch locations from CPO',
                error,
            }) as HttpResponse<OCPILocationsResponse>;
        }
    }

    public static async sendGetLocation(
        req: Request,
        cpoAuthToken: string | undefined,
        partnerId?: string,
    ): Promise<HttpResponse<OCPILocationResponse>> {
        const locationId = req.params.location_id;

        if (!locationId) {
            return OCPIResponseService.clientError<unknown>({
                message: 'location_id path parameter is required',
            }) as HttpResponse<OCPILocationResponse>;
        }
        if (!cpoAuthToken) {
            return OCPIResponseService.clientError<unknown>({
                message: 'CPO auth token is required',
            }) as HttpResponse<OCPILocationResponse>;
        }

        try {
            const baseUrl = await Utils.getOcpiEndpoint('locations', 'SENDER', partnerId);
            const url = `${baseUrl}/${encodeURIComponent(locationId)}`;

            const response = await OCPIOutgoingRequestService.sendGetRequest({
                url,
                headers: {
                    Authorization: OCPIOutgoingRequestService.getAuthorizationHeader(
                        url,
                        cpoAuthToken,
                    ),
                },
                partnerId,
                command: OCPILogCommand.SendGetLocationOneReq,
            });

            const payload = response.data as OCPILocationResponse;

            if (!payload || !payload.data) {
                return OCPIResponseService.clientError<unknown>({
                    message: 'Invalid response format from CPO location endpoint',
                }) as HttpResponse<OCPILocationResponse>;
            }

            return {
                httpStatus: 200,
                payload,
            };
        }
        catch (error) {
            return OCPIResponseService.serverError<unknown>({
                message: 'Failed to fetch location from CPO',
                error,
            }) as HttpResponse<OCPILocationResponse>;
        }
    }

    // Endpoint URL is now resolved via Utils.getOcpiEndpoint('locations', role)
}
