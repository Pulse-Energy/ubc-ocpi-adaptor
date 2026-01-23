import { Location, EVSE, EVSEConnector, Prisma } from '@prisma/client';
import { databaseService } from '../services/database.service';
import {
    OCPIConnector,
    OCPIEVSE,
    OCPILocation,
    OCPIAdditionalGeoLocation,
    OCPIBusinessDetailsClass,
    OCPIEnergyMix,
    OCPIHours,
    OCPIImageClass,
    OCPIPublishTokenType,
    OCPIStatusSchedule,
} from '../ocpi/schema/modules/locations/types';
import { OCPIDisplayText } from '../ocpi/schema/general/types';
import {
    OCPICapability,
    OCPIFacility,
    OCPIParkingRestriction,
    OCPIParkingType,
    OCPIStatus,
    OCPIPowerType,
    OCPIConnectorType,
    OCPIConnectorFormat,
} from '../ocpi/schema/modules/locations/enums';

export type LocationWithRelations = Location & {
    evses: (EVSE & { evse_connectors: EVSEConnector[] })[];
};

export type EVSEWithRelations = EVSE & {
    evse_connectors: EVSEConnector[];
};

export class LocationDbService {
    /**
     * Generate Beckn connector ID in format: IND*{ubc_party_id}*{ocpi_location_id}*{evse_uid}*{connector_id}
     * @param ubcPartyId - UBC party ID (default: TPC)
     * @param ocpiLocationId - OCPI location ID
     * @param evseUid - EVSE UID
     * @param connectorId - Connector ID
     * @returns Formatted Beckn connector ID
     */
    public static generateBecknConnectorId(
        ubcPartyId: string,
        ocpiLocationId: string,
        evseUid: string,
        connectorId: string,
    ): string {
        return `IND*${ubcPartyId}*${ocpiLocationId}*${evseUid}*${connectorId}`;
    }

    /**
     * Bulk generate and store beckn_connector_id for all connectors of a partner
     * @param partnerId - Partner ID
     * @param ubcPartyId - UBC party ID (default: TPC)
     * @returns Number of connectors updated
     */
    public static async generateBecknConnectorIdsForPartner(
        partnerId: string,
        ubcPartyId: string = 'TPC',
    ): Promise<{ updated: number; connectors: Array<{ id: string; beckn_connector_id: string }> }> {
        const prisma = databaseService.prisma;

        // Fetch all connectors for this partner with their EVSE and Location info
        const connectors = await prisma.eVSEConnector.findMany({
            where: {
                partner_id: partnerId,
                deleted: false,
            },
            include: {
                evse: {
                    include: {
                        location: true,
                    },
                },
            },
        });

        const updatedConnectors: Array<{ id: string; beckn_connector_id: string }> = [];

        for (const connector of connectors) {
            if (!connector.evse || !connector.evse.location) {
                continue;
            }

            const becknConnectorId = this.generateBecknConnectorId(
                ubcPartyId,
                connector.evse.location.ocpi_location_id,
                connector.evse.uid,
                connector.connector_id,
            );

            await prisma.eVSEConnector.update({
                where: { id: connector.id },
                data: { beckn_connector_id: becknConnectorId },
            });

            updatedConnectors.push({
                id: connector.id,
                beckn_connector_id: becknConnectorId,
            });
        }

        return {
            updated: updatedConnectors.length,
            connectors: updatedConnectors,
        };
    }

    public static async findByOcpiLocationId(
        locationId: string,
        partnerId?: string,
    ): Promise<LocationWithRelations | null> {
        return databaseService.prisma.location.findFirst({
            where: {
                ocpi_location_id: locationId,
                deleted: false,
                ...(partnerId ? { partner_id: partnerId } : {}),
            },
            include: {
                evses: {
                    include: {
                        evse_connectors: true,
                    },
                },
            },
        }) as Promise<LocationWithRelations | null>;
    }

    public static async upsertFromOcpiLocation(
        ocpiLocation: OCPILocation,
        partnerId: string,
        ubcPartyId: string = 'TPC',
    ): Promise<LocationWithRelations> {
        const prisma = databaseService.prisma;

        let locationRecord = await prisma.location.findFirst({
            where: {
                ocpi_location_id: ocpiLocation.id,
                country_code: ocpiLocation.country_code,
                party_id: ocpiLocation.party_id,
            },
        });

        const locationData = this.mapOcpiLocationToPrisma(ocpiLocation);

        if (locationRecord) {
            // Replace EVSE/connector tree for this location
            await prisma.eVSE.deleteMany({
                where: {
                    location_id: locationRecord.id,
                },
            });

            locationRecord = await prisma.location.update({
                where: { id: locationRecord.id },
                data: {
                    ...locationData,
                    partner: {
                        connect: { id: partnerId },
                    },
                },
            });
        }
        else {
            locationRecord = await prisma.location.create({
                data: {
                    ...locationData,
                    partner: {
                        connect: { id: partnerId },
                    },
                },
            });
        }

        // Recreate EVSE + Connector tree if present
        if (ocpiLocation.evses && ocpiLocation.evses.length > 0) {
            for (const evse of ocpiLocation.evses) {
                const evseRecord = await this.createEvseForLocation(
                    locationRecord.id,
                    partnerId,
                    evse,
                    ocpiLocation.coordinates,
                );

                if (evse.connectors && evse.connectors.length > 0) {
                    for (const connector of evse.connectors) {
                        await this.createConnectorForEvse(
                            evseRecord.id,
                            partnerId,
                            connector,
                            ocpiLocation.id,
                            evse.uid,
                            ubcPartyId,
                        );
                    }
                }
            }
        }

        return prisma.location.findUnique({
            where: { id: locationRecord.id },
            include: {
                evses: {
                    include: {
                        evse_connectors: true,
                    },
                },
            },
        }) as Promise<LocationWithRelations>;
    }

    public static mapPrismaLocationToOcpi(location: LocationWithRelations): OCPILocation {
        return {
            country_code: location.country_code,
            party_id: location.party_id,
            id: location.ocpi_location_id,
            publish: location.publish,
            publish_allowed_to: (location.publish_allowed_to as OCPIPublishTokenType[] | null) ?? undefined,
            name: location.name ?? undefined,
            address: location.address,
            city: location.city,
            postal_code: location.postal_code ?? undefined,
            state: location.state ?? undefined,
            country: location.country,
            coordinates: {
                latitude: location.latitude,
                longitude: location.longitude,
            },
            related_locations: (location.related_locations as OCPIAdditionalGeoLocation[] | null) ?? undefined,
            parking_type: (location.parking_type as OCPIParkingType | null) ?? undefined,
            evses: location.evses.map((evse) => this.mapPrismaEVSEToOcpi(evse)),
            directions: location.directions as OCPIDisplayText[] | undefined,
            operator: (location.operator as OCPIBusinessDetailsClass | null) ?? undefined,
            suboperator: (location.suboperator as OCPIBusinessDetailsClass | null) ?? undefined,
            owner: (location.owner as OCPIBusinessDetailsClass | null) ?? undefined,
            facilities: location.facilities as OCPIFacility[] | undefined,
            time_zone: location.time_zone,
            opening_times: (location.opening_times as OCPIHours | null) ?? undefined,
            charging_when_closed: location.charging_when_closed ?? undefined,
            images: (location.images as OCPIImageClass[] | null) ?? undefined,
            energy_mix: (location.energy_mix as OCPIEnergyMix | null) ?? undefined,
            last_updated: location.last_updated.toISOString(),
        };
    }

    public static mapPrismaEVSEToOcpi(evse: EVSE & { evse_connectors: EVSEConnector[] }): OCPIEVSE {
        return {
            uid: evse.uid,
            evse_id: evse.evse_id ?? undefined,
            status: evse.status as OCPIStatus,
            status_schedule: (evse.status_schedule as OCPIStatusSchedule[] | null) ?? undefined,
            capabilities: evse.capabilities as OCPICapability[] | undefined,
            connectors: evse.evse_connectors.map((connector) => this.mapPrismaConnectorToOcpi(connector)),
            floor_level: evse.floor_level ?? undefined,
            coordinates: evse.latitude && evse.longitude ? {
                latitude: evse.latitude,
                longitude: evse.longitude,
            } : undefined,
            physical_reference: evse.physical_reference ?? undefined,
            directions: evse.directions as OCPIDisplayText[] | undefined,
            parking_restrictions: evse.parking_restrictions as OCPIParkingRestriction[] | undefined,
            images: (evse.images as OCPIImageClass[] | null) ?? undefined,
            last_updated: evse.last_updated.toISOString(),
            status_errorcode: evse.status_errorcode ?? undefined,
            status_errordescription: evse.status_errordescription ?? undefined,
        };
    }

    public static mapPrismaConnectorToOcpi(connector: EVSEConnector): OCPIConnector & { beckn_connector_id?: string } {
        return {
            id: connector.connector_id,
            standard: connector.standard as OCPIConnectorType,
            format: connector.format as OCPIConnectorFormat,
            qr_code: connector.qr_code ?? undefined,
            power_type: connector.power_type as OCPIPowerType,
            max_voltage: BigInt(connector.max_voltage),
            max_amperage: BigInt(connector.max_amperage),
            max_electric_power: connector.max_electric_power != null
                ? BigInt(connector.max_electric_power)
                : undefined,
            tariff_ids: connector.tariff_ids ?? undefined,
            terms_and_conditions: connector.terms_and_conditions ?? undefined,
            last_updated: connector.last_updated.toISOString(),
            beckn_connector_id: connector.beckn_connector_id ?? undefined,
        };
    }

    /**
     * Find EVSE directly by location OCPI ID and EVSE UID
     */
    public static async findEVSEByLocationAndUid(
        ocpiLocationId: string,
        evseUid: string,
        partnerId: string,
    ): Promise<EVSEWithRelations | null> {
        // First find the location to get the internal location_id
        const location = await databaseService.prisma.location.findFirst({
            where: {
                ocpi_location_id: ocpiLocationId,
                partner_id: partnerId,
                deleted: false,
            },
            select: {
                id: true,
            },
        });

        if (!location) {
            return null;
        }

        // Then find the EVSE directly
        return databaseService.prisma.eVSE.findFirst({
            where: {
                location_id: location.id,
                uid: evseUid,
                partner_id: partnerId,
                deleted: false,
            },
            include: {
                evse_connectors: true,
            },
        }) as Promise<EVSEWithRelations | null>;
    }

    /**
     * Parses the formatted Beckn connector ID
     * Format: IND*${sellerId}*${csId}*${cpId}*${connectorId}
     * Returns: { countryCode, sellerId, csId, cpId, connectorId }
     */
    public static parseBecknConnectorId(formattedId: string): {
        countryCode: string;
        sellerId: string;
        csId: string;
        cpId: string;
        connectorId: string;
    } {
        const parts = formattedId.split('*');
        if (parts.length !== 5) {
            throw new Error(`Invalid connector ID format: ${formattedId}. Expected format: IND*sellerId*csId*cpId*connectorId`);
        }
        return {
            countryCode: parts[0], // IND
            sellerId: parts[1],     // seller/party ID
            csId: parts[2],         // charging station ID (location OCPI ID)
            cpId: parts[3],         // charge point ID (EVSE UID)
            connectorId: parts[4],  // connector ID
        };
    }

    /**
     * Finds EVSE directly from Beckn connector ID (formatted string)
     * Format: IND*${sellerId}*${csId}*${cpId}*${connectorId}
     * Does not match by partner_id, just finds by location OCPI ID (csId) and EVSE UID (cpId)
     * @param becknConnectorId - Formatted connector ID string
     * @returns EVSE with connectors, or null if not found
     */
    public static async findEVSEByBecknConnectorId(
        becknConnectorId: string,
    ): Promise<EVSEWithRelations | null> {
        // Parse the formatted connector ID
        const parsed = LocationDbService.parseBecknConnectorId(becknConnectorId);
        
        // Find location by OCPI location ID (csId) - no partner_id filter
        const location = await databaseService.prisma.location.findFirst({
            where: {
                ocpi_location_id: parsed.csId,
                deleted: false,
            },
            select: {
                id: true,
            },
        });

        if (!location) {
            return null;
        }

        // Find EVSE directly by location_id and uid (cpId) - no partner_id filter
        return databaseService.prisma.eVSE.findFirst({
            where: {
                location_id: location.id,
                uid: parsed.cpId,
                deleted: false,
            },
            include: {
                evse_connectors: true,
            },
        }) as Promise<EVSEWithRelations | null>;
    }

    /**
     * Find Connector directly by location OCPI ID, EVSE UID, and connector ID
     */
    public static async findConnectorByLocationEvseAndConnectorId(
        ocpiLocationId: string,
        evseUid: string,
        connectorId: string,
    ): Promise<EVSEConnector | null> {
        // First find the location to get the internal location_id
        const location = await databaseService.prisma.location.findFirst({
            where: {
                ocpi_location_id: ocpiLocationId,
                deleted: false,
            },
            select: {
                id: true,
            },
        });

        if (!location) {
            return null;
        }

        // Then find the EVSE to get the internal evse_id
        const evse = await databaseService.prisma.eVSE.findFirst({
            where: {
                location_id: location.id,
                uid: evseUid,
                deleted: false,
            },
            select: {
                id: true,
            },
        });

        if (!evse) {
            return null;
        }

        // Finally find the connector directly
        return databaseService.prisma.eVSEConnector.findFirst({
            where: {
                evse_id: evse.id,
                connector_id: connectorId,
                deleted: false,
            },
        });
    }

    private static mapOcpiLocationToPrisma(ocpiLocation: OCPILocation) {
        return {
            ocpi_location_id: ocpiLocation.id,
            name: ocpiLocation.name ?? null,
            // Coordinates are required by OCPI, but be defensive in case a CPO omits them.
            latitude: ocpiLocation.coordinates?.latitude ?? '0',
            longitude: ocpiLocation.coordinates?.longitude ?? '0',
            country_code: ocpiLocation.country_code,
            party_id: ocpiLocation.party_id,
            city: ocpiLocation.city,
            postal_code: ocpiLocation.postal_code ?? null,
            state: ocpiLocation.state ?? null,
            country: ocpiLocation.country,
            address: ocpiLocation.address,
            time_zone: ocpiLocation.time_zone,
            parking_type: ocpiLocation.parking_type ?? null,
            // JSON/array fields: if missing, store empty array/object instead of JSON null
            related_locations: ocpiLocation.related_locations
                ? ocpiLocation.related_locations as Prisma.InputJsonValue
                : [] as Prisma.InputJsonValue,
            directions: ocpiLocation.directions
                ? ocpiLocation.directions as Prisma.InputJsonValue
                : [] as Prisma.InputJsonValue,
            operator: ocpiLocation.operator
                ? ocpiLocation.operator as Prisma.InputJsonValue
                : {} as Prisma.InputJsonValue,
            suboperator: ocpiLocation.suboperator
                ? ocpiLocation.suboperator as Prisma.InputJsonValue
                : {} as Prisma.InputJsonValue,
            owner: ocpiLocation.owner
                ? ocpiLocation.owner as Prisma.InputJsonValue
                : {} as Prisma.InputJsonValue,
            facilities: ocpiLocation.facilities ?? [],
            opening_times: ocpiLocation.opening_times
                ? JSON.parse(JSON.stringify(ocpiLocation.opening_times)) as Prisma.InputJsonValue
                : {} as Prisma.InputJsonValue,
            images: ocpiLocation.images
                ? ocpiLocation.images as Prisma.InputJsonValue
                : [] as Prisma.InputJsonValue,
            energy_mix: ocpiLocation.energy_mix
                ? ocpiLocation.energy_mix as Prisma.InputJsonValue
                : {} as Prisma.InputJsonValue,
            charging_when_closed: ocpiLocation.charging_when_closed ?? null,
            publish: ocpiLocation.publish,
            publish_allowed_to: ocpiLocation.publish_allowed_to
                ? ocpiLocation.publish_allowed_to as Prisma.InputJsonValue
                : [] as Prisma.InputJsonValue,
            last_updated: new Date(ocpiLocation.last_updated ?? new Date().toISOString()),
        };
    }

    private static async createEvseForLocation(
        locationId: string,
        partnerId: string,
        evse: OCPIEVSE,
        fallbackCoordinates?: { latitude: string; longitude: string },
    ): Promise<EVSE> {
        const prisma = databaseService.prisma;

        const evseData = {
            location_id: locationId,
            partner_id: partnerId,
            uid: evse.uid,
            evse_id: evse.evse_id ?? null,
            status: evse.status as OCPIStatus,
            status_schedule: evse.status_schedule
                ? evse.status_schedule as Prisma.InputJsonValue
                : [] as Prisma.InputJsonValue,
            capabilities: evse.capabilities ?? [],
            floor_level: evse.floor_level ?? null,
            latitude: evse.coordinates?.latitude ?? fallbackCoordinates?.latitude ?? '0',
            longitude: evse.coordinates?.longitude ?? fallbackCoordinates?.longitude ?? '0',
            physical_reference: evse.physical_reference ?? null,
            directions: evse.directions
                ? evse.directions as Prisma.InputJsonValue
                : [] as Prisma.InputJsonValue,
            parking_restrictions: evse.parking_restrictions ?? [],
            images: evse.images
                ? evse.images as Prisma.InputJsonValue
                : [] as Prisma.InputJsonValue,
            status_errorcode: evse.status_errorcode ? String(evse.status_errorcode) : null,
            status_errordescription: evse.status_errordescription ?? null,
            last_updated: new Date(evse.last_updated ?? new Date().toISOString()),
        };

        // Check if EVSE already exists (unique constraint on location_id + uid)
        const existingEvse = await prisma.eVSE.findFirst({
            where: {
                location_id: locationId,
                uid: evse.uid,
            },
        });

        if (existingEvse) {
            // Update existing EVSE
            return prisma.eVSE.update({
                where: {
                    id: existingEvse.id,
                },
                data: evseData,
            });
        }
        else {
            // Create new EVSE
            return prisma.eVSE.create({
                data: evseData,
            });
        }
    }

    private static async createConnectorForEvse(
        evseId: string,
        partnerId: string,
        connector: OCPIConnector,
        ocpiLocationId?: string,
        evseUid?: string,
        ubcPartyId?: string,
    ): Promise<EVSEConnector> {
        const prisma = databaseService.prisma;

        // Generate beckn_connector_id if we have all the required info
        let becknConnectorId: string | null = null;
        if (ocpiLocationId && evseUid && ubcPartyId) {
            becknConnectorId = this.generateBecknConnectorId(
                ubcPartyId,
                ocpiLocationId,
                evseUid,
                connector.id,
            );
        }

        return prisma.eVSEConnector.create({
            data: {
                evse_id: evseId,
                partner_id: partnerId,
                connector_id: connector.id,
                standard: (connector.standard ? String(connector.standard) : 'UNKNOWN'),
                format: String(connector.format),
                qr_code: connector.qr_code ?? null,
                power_type: connector.power_type as OCPIPowerType,
                max_voltage: connector.max_voltage ?? BigInt(0),
                max_amperage: connector.max_amperage ?? BigInt(0),
                max_electric_power: connector.max_electric_power ?? null,
                tariff_ids: connector.tariff_ids ?? [],
                terms_and_conditions: connector.terms_and_conditions ?? null,
                last_updated: new Date(connector.last_updated ?? new Date().toISOString()),
                beckn_connector_id: becknConnectorId,
            },
        });
    }
}



