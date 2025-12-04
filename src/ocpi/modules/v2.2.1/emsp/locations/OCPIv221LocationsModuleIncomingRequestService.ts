import { Request } from 'express';
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
import { LocationDbService, LocationWithRelations } from '../../../../../services/location-db.service';

/**
 * Handle all incoming requests for the Locations module from the CPO
 */
export default class OCPIv221LocationsModuleIncomingRequestService {

    // get requests

    public static async handleGetLocations(req: Request): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
        const offset = req.query.offset ? Number(req.query.offset) : undefined;

        const prismaLocations = await databaseService.prisma.location.findMany({
            take: limit,
            skip: offset,
            where: {
                deleted: false,
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

    public static async handleGetEVSE(req: Request): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const { location_id, evse_uid } = req.params;

        const prismaLocation = await LocationDbService.findByOcpiLocationId(location_id);
        if (!prismaLocation) {
            return OCPIResponseService.clientError<OCPIEVSE[]>([]);
        }

        const ocpiLocation = LocationDbService.mapPrismaLocationToOcpi(prismaLocation);
        const evses = (ocpiLocation.evses || []).filter((evse) => evse.uid === evse_uid);

        return OCPIResponseService.success<OCPIEVSE[]>(evses);
    }

    public static async handleGetConnector(req: Request): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const { location_id, evse_uid, connector_id } = req.params;

        const prismaLocation = await LocationDbService.findByOcpiLocationId(location_id);
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

    public static async handlePutLocation(req: Request): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const { location_id } = req.params;
        const payload = req.body as OCPILocation;

        if (!payload || payload.id !== location_id) {
            return OCPIResponseService.clientError<OCPILocation | null>(null);
        }

        const stored = await LocationDbService.upsertFromOcpiLocation(payload);
        const ocpiLocation = LocationDbService.mapPrismaLocationToOcpi(stored);

        return OCPIResponseService.success<OCPILocation>(ocpiLocation);
    }

    public static async handlePutEVSE(req: Request): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const { location_id, evse_uid } = req.params as { location_id: string; evse_uid: string };
        const payload = req.body as OCPIEVSE;

        if (!payload || payload.uid !== evse_uid) {
            return OCPIResponseService.clientError<OCPIEVSE[]>([]);
        }

        const prismaLocation = await LocationDbService.findByOcpiLocationId(location_id);
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

        const stored = await LocationDbService.upsertFromOcpiLocation(updatedLocation);
        const storedLocation = LocationDbService.mapPrismaLocationToOcpi(stored);
        const resultEvses = (storedLocation.evses || []).filter((e) => e.uid === evse_uid);

        return OCPIResponseService.success<OCPIEVSE[]>(resultEvses);
    }

    public static async handlePutConnector(req: Request): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const { location_id, evse_uid, connector_id } = req.params as {
            location_id: string;
            evse_uid: string;
            connector_id: string;
        };
        const payload = req.body as OCPIConnector;

        if (!payload || payload.id !== connector_id) {
            return OCPIResponseService.clientError<OCPIConnector[]>([]);
        }

        const prismaLocation = await LocationDbService.findByOcpiLocationId(location_id);
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

        const stored = await LocationDbService.upsertFromOcpiLocation(updatedLocation);
        const storedLocation = LocationDbService.mapPrismaLocationToOcpi(stored);
        const resultConnectors: OCPIConnector[] =
            (storedLocation.evses || [])
                .filter((e) => e.uid === evse_uid)
                .flatMap((e) => (e.connectors || []).filter((c) => c.id === connector_id));

        return OCPIResponseService.success<OCPIConnector[]>(resultConnectors);
    }

    // patch requests

    public static async handlePatchLocation(req: Request): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const { location_id } = req.params;
        const patch = req.body as OCPIPatchLocation;

        const prismaLocation = await LocationDbService.findByOcpiLocationId(location_id);
        if (!prismaLocation) {
            return OCPIResponseService.clientError<OCPILocation | null>(null);
        }

        const current = LocationDbService.mapPrismaLocationToOcpi(prismaLocation);
        const patched: OCPILocation = {
            ...current,
            ...patch,
            coordinates: patch.coordinates ?? current.coordinates,
        };

        const stored = await LocationDbService.upsertFromOcpiLocation(patched);
        const ocpiLocation = LocationDbService.mapPrismaLocationToOcpi(stored);

        return OCPIResponseService.success<OCPILocation>(ocpiLocation);
    }

    public static async handlePatchEVSE(req: Request): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const { location_id, evse_uid } = req.params as { location_id: string; evse_uid: string };
        const patch = req.body as OCPIPatchEVSE;

        const prismaLocation = await LocationDbService.findByOcpiLocationId(location_id);
        if (!prismaLocation) {
            return OCPIResponseService.clientError<OCPIEVSE | null>(null);
        }

        const currentLocation = LocationDbService.mapPrismaLocationToOcpi(prismaLocation);
        const evses = currentLocation.evses || [];

        const updatedEvses: OCPIEVSE[] = evses.map((evse) => {
            if (evse.uid !== evse_uid) {
                return evse;
            }
            return {
                ...evse,
                ...patch,
                coordinates: patch.coordinates ?? evse.coordinates,
            };
        });

        const updatedLocation: OCPILocation = {
            ...currentLocation,
            evses: updatedEvses,
        };

        const stored = await LocationDbService.upsertFromOcpiLocation(updatedLocation);
        const storedLocation = LocationDbService.mapPrismaLocationToOcpi(stored);
        const updatedEvse =
            (storedLocation.evses || []).find((e) => e.uid === evse_uid) ?? undefined;

        return OCPIResponseService.success<OCPIEVSE | undefined>(updatedEvse);
    }

    public static async handlePatchConnector(req: Request): Promise<HttpResponse<OCPIResponsePayload<unknown>>> {
        const { location_id, evse_uid, connector_id } = req.params as {
            location_id: string;
            evse_uid: string;
            connector_id: string;
        };
        const patch = req.body as OCPIPatchConnector;

        const prismaLocation = await LocationDbService.findByOcpiLocationId(location_id);

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

        const stored = await LocationDbService.upsertFromOcpiLocation(updatedLocation);
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