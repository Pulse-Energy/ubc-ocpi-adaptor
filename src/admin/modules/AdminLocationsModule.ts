import { Request } from 'express';
import { HttpResponse } from '../../types/responses';
import { AdminResponsePayload } from '../types/responses';
import {
    OCPILocationResponse,
    OCPILocationsResponse,
} from '../../ocpi/schema/modules/locations/types/responses';
import OCPIv221LocationsModuleOutgoingRequestService from '../../ocpi/modules/v2.2.1/emsp/locations/OCPIv221LocationsModuleOutgoingRequestService';
import { ValidationError } from '../../utils/errors';
import { databaseService } from '../../services/database.service';
import { LocationDbService } from '../../db-services/LocationDbService';
import OCPIResponseService from '../../ocpi/services/OCPIResponseService';

export default class AdminLocationsModule {
    public static async sendGetLocations(
        req: Request,
    ): Promise<HttpResponse<AdminResponsePayload<OCPILocationsResponse>>> {
        const { partner_id: partnerId } = req.query as { partner_id?: string };

        if (!partnerId) {
            throw new ValidationError('partner_id is required');
        }

        const prisma = databaseService.prisma;

        const partner = await prisma.oCPIPartner.findUnique({
            where: { id: partnerId },
            include: { credentials: true },
        });

        if (!partner || partner.deleted) {
            throw new ValidationError('OCPI partner not found');
        }

        const creds = partner.credentials;
        if (!creds || !creds.cpo_auth_token) {
            throw new ValidationError('OCPI partner credentials (cpo_auth_token) not configured');
        }

        const ocpiResponse =
            await OCPIv221LocationsModuleOutgoingRequestService.sendGetLocations(
                req,
                creds.cpo_auth_token,
                partnerId,
            );

        // On success, persist all locations (including EVSEs and connectors) into DB
        if (
            ocpiResponse.httpStatus === 200 &&
            ocpiResponse.payload &&
            Array.isArray(ocpiResponse.payload.data)
        ) {
            for (const ocpiLocation of ocpiResponse.payload.data) {
                await LocationDbService.upsertFromOcpiLocation(ocpiLocation, partnerId);
            }
        }

        return {
            httpStatus: ocpiResponse.httpStatus,
            headers: ocpiResponse.headers,
            payload: {
                data: ocpiResponse.payload,
            },
        };
    }

    public static async sendGetLocation(
        req: Request,
    ): Promise<HttpResponse<AdminResponsePayload<OCPILocationResponse>>> {
        const { partner_id: partnerId } = req.query as { partner_id?: string };
        const locationId = req.params.location_id;

        if (!partnerId) {
            throw new ValidationError('partner_id is required');
        }

        if (!locationId) {
            throw new ValidationError('location_id path parameter is required');
        }

        // First, try to fetch from DB cache
        const cachedLocation = await LocationDbService.findByOcpiLocationId(locationId);
        if (cachedLocation) {
            const ocpiLocation = LocationDbService.mapPrismaLocationToOcpi(cachedLocation);
            const ocpiResponse = OCPIResponseService.success(ocpiLocation) as HttpResponse<OCPILocationResponse>;

            return {
                httpStatus: ocpiResponse.httpStatus,
                headers: ocpiResponse.headers,
                payload: {
                    data: ocpiResponse.payload,
                },
            };
        }

        const prisma = databaseService.prisma;

        const partner = await prisma.oCPIPartner.findUnique({
            where: { id: partnerId },
            include: { credentials: true },
        });

        if (!partner || partner.deleted) {
            throw new ValidationError('OCPI partner not found');
        }

        const creds = partner.credentials;
        if (!creds || !creds.cpo_auth_token) {
            throw new ValidationError('OCPI partner credentials (cpo_auth_token) not configured');
        }

        const ocpiResponse =
            await OCPIv221LocationsModuleOutgoingRequestService.sendGetLocation(
                req,
                creds.cpo_auth_token,
                partnerId,
            );

        // On success, persist location tree into DB
        if (
            ocpiResponse.httpStatus === 200 &&
            ocpiResponse.payload &&
            ocpiResponse.payload.data
        ) {
            await LocationDbService.upsertFromOcpiLocation(ocpiResponse.payload.data, partnerId);
        }

        return {
            httpStatus: ocpiResponse.httpStatus,
            headers: ocpiResponse.headers,
            payload: {
                data: ocpiResponse.payload,
            },
        };
    }
}