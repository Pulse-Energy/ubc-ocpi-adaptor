import { Request } from 'express';
import { OCPIPartnerCredentials } from '@prisma/client';
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

    public static async handleGetEVSE(
        req: Request,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const { location_id, evse_uid } = req.params;

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
        const { location_id, evse_uid, connector_id } = req.params;

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
        const { location_id } = req.params;
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
        const { location_id, evse_uid } = req.params as { location_id: string; evse_uid: string };
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

        // Merge or replace EVSE within location and re-upsert the full location tree
        const ocpiLocation = LocationDbService.mapPrismaLocationToOcpi(prismaLocation);
        const evses = ocpiLocation.evses || [];
        const filtered = evses.filter((e) => e.uid !== evse_uid);
        const updatedLocation: OCPILocation = {
            ...ocpiLocation,
            evses: [...filtered, payload],
        };
        const stored = await LocationDbService.upsertFromOcpiLocation(
            updatedLocation,
            partnerCredentials.partner_id,
        );
        const storedLocation = LocationDbService.mapPrismaLocationToOcpi(stored);
        const resultEvses = (storedLocation.evses || []).filter((e) => e.uid === evse_uid);

        return OCPIResponseService.success<OCPIEVSE[]>(resultEvses);
    }

    public static async handlePutConnector(
        req: Request,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const { location_id, evse_uid, connector_id } = req.params as {
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

        const ocpiLocation = LocationDbService.mapPrismaLocationToOcpi(prismaLocation);
        const evses = ocpiLocation.evses || [];
        const updatedEvses: OCPIEVSE[] = evses.map((evse) => {
            if (evse.uid !== evse_uid) {
                return evse;
            }
            const connectors = evse.connectors || [];
            const filtered = connectors.filter((c) => c.id !== connector_id);
            return {
                ...evse,
                connectors: [...filtered, payload],
            };
        });

        const updatedLocation: OCPILocation = {
            ...ocpiLocation,
            evses: updatedEvses,
        };
        const stored = await LocationDbService.upsertFromOcpiLocation(
            updatedLocation,
            partnerCredentials.partner_id,
        );
        const storedLocation = LocationDbService.mapPrismaLocationToOcpi(stored);
        const resultConnectors: OCPIConnector[] =
            (storedLocation.evses || [])
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
        type PatchConnectorWithId = OCPIPatchConnector & { id?: string };
        type EVSEPatchWithConnectors = OCPIPatchEVSE & { connectors?: PatchConnectorWithId[] };

        const patch = req.body as EVSEPatchWithConnectors;

        const prismaLocation = await LocationDbService.findByOcpiLocationId(
            location_id,
            partnerCredentials.partner_id,
        );
        if (!prismaLocation) {
            return OCPIResponseService.clientError<OCPIEVSE | null>(null);
        }

        const currentLocation = LocationDbService.mapPrismaLocationToOcpi(prismaLocation);
        const evses = currentLocation.evses || [];

        const updatedEvses: OCPIEVSE[] = evses.map((evse) => {
            if (evse.uid !== evse_uid) {
                return evse;
            }
            const { connectors: connectorPatches, ...evseFieldsPatch } = patch;

            const mergedEvse: OCPIEVSE = {
                ...evse,
                ...evseFieldsPatch,
                coordinates: evseFieldsPatch.coordinates ?? evse.coordinates,
            };

            // If connector patches are present, merge them by connector id
            if (connectorPatches && connectorPatches.length > 0 && evse.connectors) {
                const mergedConnectors: OCPIConnector[] = evse.connectors.map((connector) => {
                    const connectorPatch = connectorPatches.find((cp) => cp.id === connector.id);
                    if (!connectorPatch) {
                        return connector;
                    }

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

        const updatedLocation: OCPILocation = {
            ...currentLocation,
            evses: updatedEvses,
        };
        const stored = await LocationDbService.upsertFromOcpiLocation(
            updatedLocation,
            partnerCredentials.partner_id,
        );
        const storedLocation = LocationDbService.mapPrismaLocationToOcpi(stored);
        const updatedEvse =
            (storedLocation.evses || []).find((e) => e.uid === evse_uid) ?? undefined;

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