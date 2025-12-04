import { Request } from 'express';
import { HttpResponse } from '../../../../../types/responses';
import { OCPILocation } from '../../../../schema/modules/locations/types';
import {
    OCPILocationResponse,
    OCPILocationsResponse,
} from '../../../../schema/modules/locations/types/responses';
import OCPIResponseService from '../../../../services/OCPIResponseService';
import OCPIOutgoingRequestService from '../../../../services/OCPIOutgoingRequestService';
import { getOcpiCpoAuthToken } from '../../../../utils/ocpi-auth-token';
import Utils from '../../../../../utils/Utils';
import { LocationDbService, LocationWithRelations } from '../../../../../db-services/LocationDbService';

/**
 * Handle all outgoing requests for the Locations module to the CPO.
 *
 * This service is OCPI/EMSP–centric and is reused by the admin layer,
 * so that all OCPI-specific logic lives in one place.
 */
export default class OCPIv221LocationsModuleOutgoingRequestService {
    public static async sendGetLocations(
        req: Request,
    ): Promise<HttpResponse<OCPILocationsResponse>> {
        try {
            const baseUrl = OCPIv221LocationsModuleOutgoingRequestService.getLocationsEndpointUrl('SENDER');

            const limit = req.query.limit ? Number(req.query.limit) : undefined;
            const offset = req.query.offset ? Number(req.query.offset) : undefined;

            const url = OCPIv221LocationsModuleOutgoingRequestService.appendQueryParams(baseUrl, { limit, offset });

            const authToken = getOcpiCpoAuthToken();
            const response = await OCPIOutgoingRequestService.sendGetRequest({
                url,
                headers: {
                    Authorization: OCPIOutgoingRequestService.getAuthorizationHeader(
                        url,
                        authToken,
                    ),
                },
            });

            const payload = response.data as OCPILocationsResponse;

            if (!payload || !payload.data || !Array.isArray(payload.data)) {
                return OCPIResponseService.clientError<unknown>({
                    message: 'Invalid response format from CPO locations endpoint',
                }) as HttpResponse<OCPILocationsResponse>;
            }

            // Persist all locations (including EVSEs and connectors) into DB
            for (const ocpiLocation of payload.data) {
                await LocationDbService.upsertFromOcpiLocation(ocpiLocation);
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
    ): Promise<HttpResponse<OCPILocationResponse>> {
        const locationId = req.params.location_id;

        if (!locationId) {
            return OCPIResponseService.clientError<unknown>({
                message: 'location_id path parameter is required',
            }) as HttpResponse<OCPILocationResponse>;
        }

        try {
            // First, try to fetch from DB cache
            const cachedLocation: LocationWithRelations | null = await LocationDbService.findByOcpiLocationId(
                locationId,
            );

            if (cachedLocation) {
                const ocpiLocation: OCPILocation = LocationDbService.mapPrismaLocationToOcpi(
                    cachedLocation,
                );
                return OCPIResponseService.success(ocpiLocation) as HttpResponse<OCPILocationResponse>;
            }

            // Not in DB, fetch from CPO
            const baseUrl = OCPIv221LocationsModuleOutgoingRequestService.getLocationsEndpointUrl('SENDER');
            const url = `${baseUrl}/${encodeURIComponent(locationId)}`;
            const authToken = getOcpiCpoAuthToken();

            const response = await OCPIOutgoingRequestService.sendGetRequest({
                url,
                headers: {
                    Authorization: OCPIOutgoingRequestService.getAuthorizationHeader(
                        url,
                        authToken,
                    ),
                },
            });

            const payload = response.data as OCPILocationResponse;

            if (!payload || !payload.data) {
                return OCPIResponseService.clientError<unknown>({
                    message: 'Invalid response format from CPO location endpoint',
                }) as HttpResponse<OCPILocationResponse>;
            }

            const stored = await LocationDbService.upsertFromOcpiLocation(payload.data);
            const ocpiLocation = LocationDbService.mapPrismaLocationToOcpi(stored);

            return OCPIResponseService.success(ocpiLocation) as HttpResponse<OCPILocationResponse>;
        }
        catch (error) {
            return OCPIResponseService.serverError<unknown>({
                message: 'Failed to fetch location from CPO',
                error,
            }) as HttpResponse<OCPILocationResponse>;
        }
    }

    private static getLocationsEndpointUrl(role: 'SENDER' | 'RECEIVER'): string {
        const endpoints = Utils.getAllEndpoints().data.endpoints;
        const endpoint = endpoints.find(
            (e: { identifier: string; role: string; url: string }) =>
                e.identifier === 'locations' && e.role === role,
        );

        if (!endpoint || !endpoint.url) {
            throw new Error(
                `OCPI locations endpoint with role ${role} not configured in Utils.getAllEndpoints`,
            );
        }

        return endpoint.url.replace(/\/+$/, '');
    }

    private static appendQueryParams(
        baseUrl: string,
        params: { limit?: number; offset?: number },
    ): string {
        const searchParams = new globalThis.URLSearchParams();

        if (typeof params.limit === 'number' && !Number.isNaN(params.limit)) {
            searchParams.append('limit', params.limit.toString());
        }

        if (typeof params.offset === 'number' && !Number.isNaN(params.offset)) {
            searchParams.append('offset', params.offset.toString());
        }

        const queryString = searchParams.toString();
        if (!queryString) {
            return baseUrl;
        }

        return `${baseUrl}?${queryString}`;
    }
}
