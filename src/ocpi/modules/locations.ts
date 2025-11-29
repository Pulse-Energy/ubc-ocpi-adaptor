import { z } from 'zod';
import { databaseService } from '../../services/database.service';
import { logger } from '../../services/logger.service';
import { syncService } from '../../services/sync.service';
import { ValidationError } from '../../utils/errors';
import { OCPILocation, OCPIResponse } from '../types';
import { locationSchema } from '../validators';

export class LocationsModule {
    async putLocation(
        locationId: string,
        location: OCPILocation,
        cpoId: string
    ): Promise<OCPIResponse<OCPILocation>> {
        try {
            // Validate location
            locationSchema.parse(location);

            // Store or update location in database
            await databaseService.prisma.location.upsert({
                where: { location_id: locationId },
                create: {
                    location_id: location.id,
                    cpo_id: cpoId,
                    name: location.name || null,
                    address: location as any,
                    coordinates: location.coordinates as any,
                    evses: location.evses || [] as any,
                    last_updated: new Date(location.last_updated),
                },
                update: {
                    name: location.name || null,
                    address: location as any,
                    coordinates: location.coordinates as any,
                    evses: location.evses || [] as any,
                    last_updated: new Date(location.last_updated),
                },
            });

            logger.info('Location stored/updated', { locationId, cpoId });

            // Trigger CDS sync for this location
            await syncService.syncLocationToCDS(locationId).catch((error) => {
                logger.error('Error syncing location to CDS', error, { locationId });
                // Don't fail the request if CDS sync fails
            });

            return {
                status_code: 1000,
                data: location,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error: any) {
            logger.error('Error putting location', error, { locationId });
            if (error instanceof z.ZodError) {
                throw new ValidationError('Invalid location data', error.errors);
            }
            throw error;
        }
    }

    async getLocation(locationId: string): Promise<OCPILocation | null> {
        try {
            const location = await databaseService.prisma.location.findUnique({
                where: { location_id: locationId },
            });

            if (!location) {
                return null;
            }

            // Convert database format to OCPI format
            return this.mapToOCPILocation(location);
        }
        catch (error: any) {
            logger.error('Error getting location', error, { locationId });
            throw error;
        }
    }

    async getLocations(limit?: number, offset?: number): Promise<OCPILocation[]> {
        try {
            const locations = await databaseService.prisma.location.findMany({
                take: limit,
                skip: offset,
                orderBy: { last_updated: 'desc' },
            });

            return locations.map((loc) => this.mapToOCPILocation(loc));
        }
        catch (error: any) {
            logger.error('Error getting locations', error);
            throw error;
        }
    }

    private mapToOCPILocation(location: any): OCPILocation {
        return {
            id: location.locationId,
            type: 'OTHER', // Default type, should be stored in DB
            name: location.name || undefined,
            address: (location.address as any)?.address || '',
            city: (location.address as any)?.city || '',
            postal_code: (location.address as any)?.postal_code || '',
            country: (location.address as any)?.country || '',
            coordinates: location.coordinates as any,
            evses: location.evses as any,
            time_zone: (location.address as any)?.time_zone || 'UTC',
            last_updated: location.lastUpdated.toISOString(),
        };
    }
}

export const locationsModule = new LocationsModule();
