import { Request } from 'express';
import { OCPIPartnerCredentials, Prisma } from '@prisma/client';
import { HttpResponse } from '../../../../../types/responses';
import {
    OCPILocation,
    OCPIEVSE,
    OCPIConnector,
    OCPIPatchLocation,
    OCPIPatchEVSE,
    OCPIPatchConnector,
} from '../../../../schema/modules/locations/types';
import OCPIResponseService from '../../../../services/OCPIResponseService';
import { OCPIResponsePayload } from '../../../../schema/general/types/responses';
import { databaseService } from '../../../../../services/database.service';
import { LocationDbService, LocationWithRelations } from '../../../../../db-services/LocationDbService';

/**
 * Handle all incoming requests for the Locations module from the CPO
 */
export default class OCPIv221LocationsModuleIncomingRequestService {

    // get requests

    public static async handleGetLocations(
        req: Request,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const offset = req.query.offset ? Number(req.query.offset) : undefined;

        const prismaLocations = await databaseService.prisma.location.findMany({
            take: limit,
            skip: offset,
            where: {
                deleted: false,
                partner_id: partnerCredentials.partner_id,
            },
            include: {
                evses: {
                    include: {
                        evse_connectors: true,
                    },
                },
            },
            orderBy: {
                last_updated: 'desc',
            },
        });

        const ocpiLocations: OCPILocation[] = prismaLocations.map((loc) =>
            LocationDbService.mapPrismaLocationToOcpi(loc as LocationWithRelations),
        );

        return OCPIResponseService.success<OCPILocation[]>(ocpiLocations);
    }

    public static async handleGetLocation(
        req: Request,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const { location_id } = req.params as {
            country_code: string;
            party_id: string;
            location_id: string;
        };

        const prismaLocation = await LocationDbService.findByOcpiLocationId(
            location_id,
            partnerCredentials.partner_id,
        );
        if (!prismaLocation) {
            return OCPIResponseService.clientError<OCPILocation | null>(null);
        }

        const ocpiLocation = LocationDbService.mapPrismaLocationToOcpi(prismaLocation);
        return OCPIResponseService.success<OCPILocation>(ocpiLocation);
    }

    public static async handleGetEVSE(
        req: Request,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const { location_id, evse_uid } = req.params as {
            country_code: string;
            party_id: string;
            location_id: string;
            evse_uid: string;
        };

        const prismaLocation = await LocationDbService.findByOcpiLocationId(
            location_id,
            partnerCredentials.partner_id,
        );
        if (!prismaLocation) {
            return OCPIResponseService.clientError<OCPIEVSE[]>([]);
        }

        const ocpiLocation = LocationDbService.mapPrismaLocationToOcpi(prismaLocation);
        const evses = (ocpiLocation.evses || []).filter((evse) => evse.uid === evse_uid);

        return OCPIResponseService.success<OCPIEVSE[]>(evses);
    }

    public static async handleGetConnector(
        req: Request,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const { location_id, evse_uid, connector_id } = req.params as {
            country_code: string;
            party_id: string;
            location_id: string;
            evse_uid: string;
            connector_id: string;
        };

        const prismaLocation = await LocationDbService.findByOcpiLocationId(
            location_id,
            partnerCredentials.partner_id,
        );
        if (!prismaLocation) {
            return OCPIResponseService.clientError<OCPIConnector[]>([]);
        }

        const ocpiLocation = LocationDbService.mapPrismaLocationToOcpi(prismaLocation);
        const evses = (ocpiLocation.evses || []).filter((evse) => evse.uid === evse_uid);
        const connectors: OCPIConnector[] = evses.flatMap((evse) =>
            (evse.connectors || []).filter((c) => c.id === connector_id),
        );

        return OCPIResponseService.success<OCPIConnector[]>(connectors);
    }

    // put requests

    public static async handlePutLocation(
        req: Request,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const { location_id } = req.params as {
            country_code: string;
            party_id: string;
            location_id: string;
        };
        const payload = req.body as OCPILocation;

        if (!payload || payload.id !== location_id) {
            return OCPIResponseService.clientError<OCPILocation | null>(null);
        }

        const stored = await LocationDbService.upsertFromOcpiLocation(
            payload,
            partnerCredentials.partner_id,
        );
        const ocpiLocation = LocationDbService.mapPrismaLocationToOcpi(stored);

        return OCPIResponseService.success<OCPILocation>(ocpiLocation);
    }

    public static async handlePutEVSE(
        req: Request,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const { location_id, evse_uid } = req.params as {
            country_code: string;
            party_id: string;
            location_id: string;
            evse_uid: string;
        };
        const payload = req.body as OCPIEVSE;

        if (!payload || payload.uid !== evse_uid) {
            return OCPIResponseService.clientError<OCPIEVSE[]>([]);
        }
        const prismaLocation = await LocationDbService.findByOcpiLocationId(
            location_id,
            partnerCredentials.partner_id,
        );
        if (!prismaLocation) {
            return OCPIResponseService.clientError<OCPIEVSE[]>([]);
        }

        const prisma = databaseService.prisma;

        const existingEvse = await prisma.eVSE.findFirst({
            where: {
                location_id: prismaLocation.id,
                uid: evse_uid,
                deleted: false,
            },
        });

        const evseData: Prisma.EVSECreateInput = {
            location: { connect: { id: prismaLocation.id } },
            partner: { connect: { id: partnerCredentials.partner_id } },
            uid: payload.uid,
            evse_id: payload.evse_id ?? null,
            status: String(payload.status),
            status_schedule: payload.status_schedule
                ? (payload.status_schedule as unknown as Prisma.InputJsonValue)
                : [] as Prisma.InputJsonValue,
            capabilities: payload.capabilities ?? [],
            floor_level: payload.floor_level ?? null,
            latitude: payload.coordinates?.latitude ?? prismaLocation.latitude,
            longitude: payload.coordinates?.longitude ?? prismaLocation.longitude,
            physical_reference: payload.physical_reference ?? null,
            directions: payload.directions
                ? (payload.directions as unknown as Prisma.InputJsonValue)
                : [] as Prisma.InputJsonValue,
            parking_restrictions: payload.parking_restrictions ?? [],
            images: payload.images
                ? (payload.images as unknown as Prisma.InputJsonValue)
                : [] as Prisma.InputJsonValue,
            status_errorcode: payload.status_errorcode ?? null,
            status_errordescription: payload.status_errordescription ?? null,
            last_updated: new Date(payload.last_updated ?? new Date().toISOString()),
        };

        let evseRecord;
        if (existingEvse) {
            evseRecord = await prisma.eVSE.update({
                where: { id: existingEvse.id },
                data: evseData,
            });
        }
        else {
            evseRecord = await prisma.eVSE.create({ data: evseData });
        }

        // Connectors (if provided) – upsert by connector_id while keeping primary key stable
        if (payload.connectors && payload.connectors.length > 0) {
            for (const connector of payload.connectors) {
                const existingConnector = await prisma.eVSEConnector.findFirst({
                    where: {
                        evse_id: evseRecord.id,
                        connector_id: connector.id,
                        deleted: false,
                    },
                });

                const connectorData: Prisma.EVSEConnectorCreateInput = {
                    evse: { connect: { id: evseRecord.id } },
                    partner: { connect: { id: partnerCredentials.partner_id } },
                    connector_id: connector.id,
                    standard: String(connector.standard),
                    format: String(connector.format),
                    qr_code: connector.qr_code ?? null,
                    power_type: String(connector.power_type),
                    max_voltage: BigInt(connector.max_voltage),
                    max_amperage: BigInt(connector.max_amperage),
                    max_electric_power: connector.max_electric_power != null
                        ? BigInt(connector.max_electric_power)
                        : null,
                    terms_and_conditions: connector.terms_and_conditions ?? null,
                    last_updated: new Date(connector.last_updated),
                    tariff_ids: connector.tariff_ids ?? [],
                };

                if (existingConnector) {
                    await prisma.eVSEConnector.update({
                        where: { id: existingConnector.id },
                        data: connectorData,
                    });
                }
                else {
                    await prisma.eVSEConnector.create({ data: connectorData });
                }
            }
        }

        // Re-read location and return the single EVSE in OCPI form
        const refreshedLocation = await LocationDbService.findByOcpiLocationId(
            location_id,
            partnerCredentials.partner_id,
        );
        if (!refreshedLocation) {
            return OCPIResponseService.clientError<OCPIEVSE[]>([]);
        }
        const ocpiLocation = LocationDbService.mapPrismaLocationToOcpi(refreshedLocation);
        const resultEvses = (ocpiLocation.evses || []).filter((e) => e.uid === evse_uid);

        return OCPIResponseService.success<OCPIEVSE[]>(resultEvses);
    }

    public static async handlePutConnector(
        req: Request,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const { location_id, evse_uid, connector_id } = req.params as {
            country_code: string;
            party_id: string;
            location_id: string;
            evse_uid: string;
            connector_id: string;
        };
        const payload = req.body as OCPIConnector;

        if (!payload || payload.id !== connector_id) {
            return OCPIResponseService.clientError<OCPIConnector[]>([]);
        }
        const prismaLocation = await LocationDbService.findByOcpiLocationId(
            location_id,
            partnerCredentials.partner_id,
        );
        if (!prismaLocation) {
            return OCPIResponseService.clientError<OCPIConnector[]>([]);
        }

        const prisma = databaseService.prisma;

        const evseRecord = await prisma.eVSE.findFirst({
            where: {
                location_id: prismaLocation.id,
                uid: evse_uid,
                deleted: false,
            },
        });

        if (!evseRecord) {
            return OCPIResponseService.clientError<OCPIConnector[]>([]);
        }

        const existingConnector = await prisma.eVSEConnector.findFirst({
            where: {
                evse_id: evseRecord.id,
                connector_id,
                deleted: false,
            },
        });

        const connectorData: Prisma.EVSEConnectorCreateInput = {
            evse: { connect: { id: evseRecord.id } },
            partner: { connect: { id: partnerCredentials.partner_id } },
            connector_id: payload.id,
            standard: String(payload.standard),
            format: String(payload.format),
            qr_code: payload.qr_code ?? null,
            power_type: String(payload.power_type),
            max_voltage: BigInt(payload.max_voltage),
            max_amperage: BigInt(payload.max_amperage),
            max_electric_power: payload.max_electric_power != null
                ? BigInt(payload.max_electric_power)
                : null,
            terms_and_conditions: payload.terms_and_conditions ?? null,
            last_updated: new Date(payload.last_updated),
            tariff_ids: payload.tariff_ids ?? [],
        };

        if (existingConnector) {
            await prisma.eVSEConnector.update({
                where: { id: existingConnector.id },
                data: connectorData,
            });
        }
        else {
            await prisma.eVSEConnector.create({ data: connectorData });
        }

        const refreshedLocation = await LocationDbService.findByOcpiLocationId(
            location_id,
            partnerCredentials.partner_id,
        );
        if (!refreshedLocation) {
            return OCPIResponseService.clientError<OCPIConnector[]>([]);
        }
        const ocpiLocation = LocationDbService.mapPrismaLocationToOcpi(refreshedLocation);
        const resultConnectors: OCPIConnector[] =
            (ocpiLocation.evses || [])
                .filter((e) => e.uid === evse_uid)
                .flatMap((e) => (e.connectors || []).filter((c) => c.id === connector_id));

        return OCPIResponseService.success<OCPIConnector[]>(resultConnectors);
    }

    // patch requests

    public static async handlePatchLocation(
        req: Request,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const { location_id } = req.params;

        type PatchConnectorWithId = OCPIPatchConnector & { id?: string };
        type PatchEVSEWithUid = OCPIPatchEVSE & { uid?: string; connectors?: PatchConnectorWithId[] };
        type LocationPatchWithNested = OCPIPatchLocation & { evses?: PatchEVSEWithUid[] };

        const patch = req.body as LocationPatchWithNested;

        const prismaLocation = await LocationDbService.findByOcpiLocationId(
            location_id,
            partnerCredentials.partner_id,
        );
        if (!prismaLocation) {
            return OCPIResponseService.clientError<OCPILocation | null>(null);
        }

        const current = LocationDbService.mapPrismaLocationToOcpi(prismaLocation);

        // Split top-level fields and nested EVSE patches
        const { evses: patchEvses, ...topLevelPatch } = patch;

        // Apply top-level partial update (never drop fields that are not present)
        const mergedLocation: OCPILocation = {
            ...current,
            ...topLevelPatch,
            coordinates: topLevelPatch.coordinates ?? current.coordinates,
        };

        // If evses array is present, treat it as partial merge instructions.
        if (patchEvses && patchEvses.length > 0 && current.evses && current.evses.length > 0) {
            const updatedEvses: OCPIEVSE[] = current.evses.map((evse) => {
                const evsePatch = patchEvses.find((p) => p.uid === evse.uid);
                if (!evsePatch) {
                    return evse;
                }

                const { connectors: connectorPatches, ...evseFieldsPatch } = evsePatch;

                // Merge EVSE-level fields
                const mergedEvse: OCPIEVSE = {
                    ...evse,
                    ...evseFieldsPatch,
                    coordinates: evseFieldsPatch.coordinates ?? evse.coordinates,
                };

                // Merge connector-level patches, by id
                if (connectorPatches && connectorPatches.length > 0 && evse.connectors) {
                    const mergedConnectors: OCPIConnector[] = evse.connectors.map((connector) => {
                        const connectorPatch = connectorPatches.find((cp) => cp.id === connector.id);
                        if (!connectorPatch) {
                            return connector;
                        }

                        // ignore connectorPatch.id, we already matched on it
                        const connectorFieldsPatch = { ...connectorPatch };
                        delete (connectorFieldsPatch as { id?: string }).id;

                        return {
                            ...connector,
                            ...connectorFieldsPatch,
                        };
                    });

                    mergedEvse.connectors = mergedConnectors;
                }

                return mergedEvse;
            });

            mergedLocation.evses = updatedEvses;
        }
        const stored = await LocationDbService.upsertFromOcpiLocation(
            mergedLocation,
            partnerCredentials.partner_id,
        );
        const ocpiLocation = LocationDbService.mapPrismaLocationToOcpi(stored);

        return OCPIResponseService.success<OCPILocation>(ocpiLocation);
    }

    public static async handlePatchEVSE(
        req: Request,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const { location_id, evse_uid } = req.params as { location_id: string; evse_uid: string };
        const patch = req.body as OCPIPatchEVSE;

        // Find location (to resolve internal location_id) scoped to partner
        const prismaLocation = await LocationDbService.findByOcpiLocationId(
            location_id,
            partnerCredentials.partner_id,
        );
        if (!prismaLocation) {
            return OCPIResponseService.clientError<OCPIEVSE | null>(null);
        }

        const prisma = databaseService.prisma;

        // Find the concrete EVSE row; we will update it in-place instead of
        // deleting/recreating, so its primary key remains stable.
        const evseRecord = await prisma.eVSE.findFirst({
            where: {
                location_id: prismaLocation.id,
                uid: evse_uid,
                deleted: false,
            },
        });

        if (!evseRecord) {
            return OCPIResponseService.clientError<OCPIEVSE | null>(null);
        }

        const evseUpdate: Prisma.EVSEUpdateInput = {};

        if (patch.status) {
            evseUpdate.status = String(patch.status);
        }
        if (patch.status_schedule) {
            evseUpdate.status_schedule = patch.status_schedule as unknown as Prisma.InputJsonValue;
        }
        if (patch.capabilities) {
            evseUpdate.capabilities = patch.capabilities;
        }
        if (patch.floor_level !== undefined) {
            evseUpdate.floor_level = patch.floor_level;
        }
        if (patch.coordinates) {
            if (patch.coordinates.latitude) {
                evseUpdate.latitude = patch.coordinates.latitude;
            }
            if (patch.coordinates.longitude) {
                evseUpdate.longitude = patch.coordinates.longitude;
            }
        }
        if (patch.physical_reference !== undefined) {
            evseUpdate.physical_reference = patch.physical_reference;
        }
        if (patch.directions) {
            evseUpdate.directions = patch.directions as unknown as Prisma.InputJsonValue;
        }
        if (patch.parking_restrictions) {
            evseUpdate.parking_restrictions = patch.parking_restrictions;
        }
        if (patch.images) {
            evseUpdate.images = patch.images as unknown as Prisma.InputJsonValue;
        }
        if (patch.last_updated) {
            evseUpdate.last_updated = new Date(patch.last_updated);
        }
        if (patch.status_errorcode !== undefined) {
            evseUpdate.status_errorcode = patch.status_errorcode;
        }
        if (patch.status_errordescription !== undefined) {
            evseUpdate.status_errordescription = patch.status_errordescription;
        }

        await prisma.eVSE.update({
            where: { id: evseRecord.id },
            data: evseUpdate,
        });

        // Re-read location + relations and map back to OCPI
        const refreshedLocation = await LocationDbService.findByOcpiLocationId(
            location_id,
            partnerCredentials.partner_id,
        );
        if (!refreshedLocation) {
            return OCPIResponseService.clientError<OCPIEVSE | null>(null);
        }
        const ocpiLocation = LocationDbService.mapPrismaLocationToOcpi(refreshedLocation);
        const updatedEvse = (ocpiLocation.evses || []).find((e) => e.uid === evse_uid);

        return OCPIResponseService.success<OCPIEVSE | undefined>(updatedEvse);
    }

    public static async handlePatchConnector(
        req: Request,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const { location_id, evse_uid, connector_id } = req.params as {
            location_id: string;
            evse_uid: string;
            connector_id: string;
        };
        const patch = req.body as OCPIPatchConnector;

        const prismaLocation = await LocationDbService.findByOcpiLocationId(
            location_id,
            partnerCredentials.partner_id,
        );

        if (!prismaLocation) {
            return OCPIResponseService.clientError<OCPIConnector | null>(null);
        }

        const currentLocation = LocationDbService.mapPrismaLocationToOcpi(prismaLocation);
        const evses = currentLocation.evses || [];

        const updatedEvses: OCPIEVSE[] = evses.map((evse) => {
            if (evse.uid !== evse_uid) {
                return evse;
            }
            const connectors = evse.connectors || [];
            const updatedConnectors: OCPIConnector[] = connectors.map((connector) => {
                if (connector.id !== connector_id) {
                    return connector;
                }
                return {
                    ...connector,
                    ...patch,
                };
            });

            return {
                ...evse,
                connectors: updatedConnectors,
            };
        });

        const updatedLocation: OCPILocation = {
            ...currentLocation,
            evses: updatedEvses,
        };
        const stored = await LocationDbService.upsertFromOcpiLocation(
            updatedLocation,
            partnerCredentials.partner_id,
        );
        const storedLocation = LocationDbService.mapPrismaLocationToOcpi(stored);
        const evsesWithUid =
            (storedLocation.evses || []).filter((e) => e.uid === evse_uid) ?? [];
        const updatedConnector =
            evsesWithUid
                .flatMap((e) => e.connectors || [])
                .find((c) => c.id === connector_id) ?? undefined;

        return OCPIResponseService.success<OCPIConnector | undefined>(updatedConnector);
    }

}