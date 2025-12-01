import { Request } from "express";
import { HttpResponse } from "../../types/responses";
import { AdminResponsePayload } from "../types/responses";
import { ValidationError } from "../../utils/errors";
import { LocationsClient } from "../../ocpi/client/locations-client";
import { locationsModule } from "../../ocpi/modules/locations";
import { logger } from "../../services/logger.service";
import { syncService } from "../../services/sync.service";

export default class AdminLocationsModule {
    public static async fetchLocations(req: Request): Promise<HttpResponse<AdminResponsePayload<any>>> {
        const { cpoId, cpoUrl } = req.body;

        if (!cpoId || !cpoUrl) {
            throw new ValidationError('CPO ID and CPO URL are required');
        }

        const client = new LocationsClient(cpoId, cpoUrl);
        const locations = await client.fetchLocations();

        // Store locations in database
        let stored = 0;
        for (const location of locations) {
            try {
                await locationsModule.putLocation(location.id, location, cpoId);
                stored++;
            }
            catch (error) {
                const err = error instanceof Error ? error : new Error(String(error));
                logger.error('Error storing location', err, { locationId: location.id });
            }
        }

        return {
            payload: {
                data: {
                    success: true,
                    fetched: locations.length,
                    stored,
                    message: `Fetched ${locations.length} locations, stored ${stored}`,
                },
            },
        };
    }

    public static async syncToCDS(req: Request): Promise<HttpResponse<AdminResponsePayload<any>>> {
        const { locationId } = req.body;

        if (locationId) {
            // Sync single location
            await syncService.syncLocationToCDS(locationId);
            return {
                payload: {
                    data: {
                        success: true,
                        message: `Location ${locationId} synced to CDS`,
                    },
                },
            };
        }
        else {
            // Sync all locations
            const result = await syncService.syncAllLocationsToCDS();
            const { success: successCount, failed } = result;
            return {
                payload: {
                    data: {
                        success: true,
                        message: `Synced ${successCount} locations to CDS, ${failed} failed`,
                        successCount,
                        failed,
                    },
                },
            };
        }
    }

    public static async getLocations(req: Request): Promise<HttpResponse<AdminResponsePayload<any>>> {
        const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
        const offset = req.query.offset ? parseInt(req.query.offset as string) : undefined;

        const locations = await locationsModule.getLocations(limit, offset);

        return {
            payload: {
                data: {
                    success: true,
                    data: locations,
                    count: locations.length,
                },
            },
        };
    }

    public static async getLocation(req: Request): Promise<HttpResponse<AdminResponsePayload<any>>> {
        const locationId = req.params.location_id;
        const location = await locationsModule.getLocation(locationId);

        if (!location) {
            return {
                httpStatus: 404,
                payload: {
                    data: {
                        success: false,
                        message: 'Location not found',
                    },
                },
            };
        }

        return {
            payload: {
                data: {
                    success: true,
                    data: location,
                },
            },
        };
    }
}

