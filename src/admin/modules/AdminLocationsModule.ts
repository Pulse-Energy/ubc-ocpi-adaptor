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
import { logger } from '../../services/logger.service';

export default class AdminLocationsModule {
    public static async sendGetLocations(
        req: Request,
    ): Promise<HttpResponse<AdminResponsePayload<OCPILocationsResponse>>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'sendGetLocations' };

        try {
            logger.debug(`🟡 [${reqId}] Starting sendGetLocations in AdminLocationsModule`, { data: logData });

            logger.debug(`🟡 [${reqId}] Parsing query parameters in sendGetLocations`, { 
                data: { ...logData, query: req.query } 
            });
            const { partner_id: partnerId } = req.query as { partner_id?: string };

            if (!partnerId) {
                logger.warn(`🟡 [${reqId}] partner_id missing in sendGetLocations`, { data: logData });
                throw new ValidationError('partner_id is required');
            }

            const prisma = databaseService.prisma;

            logger.debug(`🟡 [${reqId}] Finding partner in sendGetLocations`, { 
                data: { ...logData, partner_id: partnerId } 
            });
            const partner = await prisma.oCPIPartner.findUnique({
                where: { id: partnerId },
                include: { credentials: true },
            });

            if (!partner || partner.deleted) {
                logger.warn(`🟡 [${reqId}] Partner not found in sendGetLocations`, { 
                    data: { ...logData, partner_id: partnerId } 
                });
                throw new ValidationError('OCPI partner not found');
            }

            logger.debug(`🟢 [${reqId}] Found partner in sendGetLocations`, { 
                data: { ...logData, partner_id: partner.id } 
            });

            const creds = partner.credentials;
            if (!creds || !creds.cpo_auth_token) {
                logger.warn(`🟡 [${reqId}] Partner credentials not configured in sendGetLocations`, { 
                    data: { ...logData, partner_id: partner.id } 
                });
                throw new ValidationError('OCPI partner credentials (cpo_auth_token) not configured');
            }

            logger.debug(`🟡 [${reqId}] Sending GET locations to CPO in sendGetLocations`, { 
                data: { ...logData, partner_id: partnerId } 
            });
            const ocpiResponse =
                await OCPIv221LocationsModuleOutgoingRequestService.sendGetLocations(
                    req,
                    creds.cpo_auth_token,
                    partnerId,
                );

            logger.debug(`🟢 [${reqId}] Received response from CPO in sendGetLocations`, { 
                data: { ...logData, httpStatus: ocpiResponse.httpStatus, hasData: !!ocpiResponse.payload } 
            });

            // On success, persist all locations (including EVSEs and connectors) into DB
            if (
                ocpiResponse.httpStatus === 200 &&
                ocpiResponse.payload &&
                Array.isArray(ocpiResponse.payload.data)
            ) {
                logger.debug(`🟡 [${reqId}] Persisting locations to database in sendGetLocations`, { 
                    data: { ...logData, locations_count: ocpiResponse.payload.data.length } 
                });
                for (const ocpiLocation of ocpiResponse.payload.data) {
                    await LocationDbService.upsertFromOcpiLocation(ocpiLocation, partnerId);
                }
                logger.debug(`🟢 [${reqId}] Persisted locations to database in sendGetLocations`, { 
                    data: { ...logData, locations_count: ocpiResponse.payload.data.length } 
                });
            }

            logger.debug(`🟢 [${reqId}] Returning sendGetLocations response`, { 
                data: { ...logData, httpStatus: ocpiResponse.httpStatus } 
            });

            return {
                httpStatus: ocpiResponse.httpStatus,
                headers: ocpiResponse.headers,
                payload: {
                    data: ocpiResponse.payload,
                },
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in sendGetLocations: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }

    public static async sendGetLocation(
        req: Request,
    ): Promise<HttpResponse<AdminResponsePayload<OCPILocationResponse>>> {
        const reqId = req.headers['x-correlation-id'] as string || req.headers['x-request-id'] as string || 'unknown';
        const logData = { action: 'sendGetLocation' };

        try {
            logger.debug(`🟡 [${reqId}] Starting sendGetLocation in AdminLocationsModule`, { data: logData });

            logger.debug(`🟡 [${reqId}] Parsing query and path parameters in sendGetLocation`, { 
                data: { ...logData, query: req.query, params: req.params } 
            });
            const { partner_id: partnerId } = req.query as { partner_id?: string };
            const locationId = req.params.location_id;

            if (!partnerId) {
                logger.warn(`🟡 [${reqId}] partner_id missing in sendGetLocation`, { data: logData });
                throw new ValidationError('partner_id is required');
            }

            if (!locationId) {
                logger.warn(`🟡 [${reqId}] location_id missing in sendGetLocation`, { data: logData });
                throw new ValidationError('location_id path parameter is required');
            }

            // First, try to fetch from DB cache
            logger.debug(`🟡 [${reqId}] Checking for cached location in sendGetLocation`, { 
                data: { ...logData, location_id: locationId } 
            });
            const cachedLocation = await LocationDbService.findByOcpiLocationId(locationId);
            if (cachedLocation) {
                logger.debug(`🟢 [${reqId}] Found cached location in sendGetLocation`, { 
                    data: { ...logData, location_id: locationId } 
                });
                const ocpiLocation = LocationDbService.mapPrismaLocationToOcpi(cachedLocation);
                const ocpiResponse = OCPIResponseService.success(ocpiLocation) as HttpResponse<OCPILocationResponse>;

                logger.debug(`🟢 [${reqId}] Returning cached location in sendGetLocation`, { 
                    data: { ...logData, location_id: locationId } 
                });

                return {
                    httpStatus: ocpiResponse.httpStatus,
                    headers: ocpiResponse.headers,
                    payload: {
                        data: ocpiResponse.payload,
                    },
                };
            }

            logger.debug(`🟡 [${reqId}] Location not in cache, fetching from CPO in sendGetLocation`, { 
                data: { ...logData, location_id: locationId, partner_id: partnerId } 
            });

            const prisma = databaseService.prisma;

            logger.debug(`🟡 [${reqId}] Finding partner in sendGetLocation`, { 
                data: { ...logData, partner_id: partnerId } 
            });
            const partner = await prisma.oCPIPartner.findUnique({
                where: { id: partnerId },
                include: { credentials: true },
            });

            if (!partner || partner.deleted) {
                logger.warn(`🟡 [${reqId}] Partner not found in sendGetLocation`, { 
                    data: { ...logData, partner_id: partnerId } 
                });
                throw new ValidationError('OCPI partner not found');
            }

            logger.debug(`🟢 [${reqId}] Found partner in sendGetLocation`, { 
                data: { ...logData, partner_id: partner.id } 
            });

            const creds = partner.credentials;
            if (!creds || !creds.cpo_auth_token) {
                logger.warn(`🟡 [${reqId}] Partner credentials not configured in sendGetLocation`, { 
                    data: { ...logData, partner_id: partner.id } 
                });
                throw new ValidationError('OCPI partner credentials (cpo_auth_token) not configured');
            }

            logger.debug(`🟡 [${reqId}] Sending GET location to CPO in sendGetLocation`, { 
                data: { ...logData, location_id: locationId, partner_id: partnerId } 
            });
            const ocpiResponse =
                await OCPIv221LocationsModuleOutgoingRequestService.sendGetLocation(
                    req,
                    creds.cpo_auth_token,
                    partnerId,
                );

            logger.debug(`🟢 [${reqId}] Received response from CPO in sendGetLocation`, { 
                data: { ...logData, httpStatus: ocpiResponse.httpStatus, hasData: !!ocpiResponse.payload } 
            });

            // On success, persist location tree into DB
            if (
                ocpiResponse.httpStatus === 200 &&
                ocpiResponse.payload &&
                ocpiResponse.payload.data
            ) {
                logger.debug(`🟡 [${reqId}] Persisting location to database in sendGetLocation`, { 
                    data: { ...logData, location_id: locationId } 
                });
                await LocationDbService.upsertFromOcpiLocation(ocpiResponse.payload.data, partnerId);
                logger.debug(`🟢 [${reqId}] Persisted location to database in sendGetLocation`, { 
                    data: { ...logData, location_id: locationId } 
                });
            }

            logger.debug(`🟢 [${reqId}] Returning sendGetLocation response`, { 
                data: { ...logData, httpStatus: ocpiResponse.httpStatus } 
            });

            return {
                httpStatus: ocpiResponse.httpStatus,
                headers: ocpiResponse.headers,
                payload: {
                    data: ocpiResponse.payload,
                },
            };
        }
        catch (e: any) {
            logger.error(`🔴 [${reqId}] Error in sendGetLocation: ${e?.toString()}`, e, {
                data: {
                    ...logData,
                    error: e,
                },
            });
            throw e;
        }
    }
}