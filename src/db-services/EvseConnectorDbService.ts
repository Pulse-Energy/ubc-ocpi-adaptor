import { Tariff, Prisma, EVSEConnector, EVSE, Location } from '@prisma/client';
import { databaseService } from '../services/database.service';

export type TariffWithRelations = Tariff;

export class EvseConnectorDbService {
    public static async getByFiltersWithoutCount(
        queryArgs: Prisma.EVSEConnectorFindManyArgs,
        page: number = 0,
        perPage: number = 0
    ): Promise<{
        records?: (EVSEConnector & { tariff?: Tariff[] })[],
        has_next?: boolean,
        has_previous?: boolean,
    }> {
        // Check if there's a previous page
        let hasPrevious = true;
        if (page === 0) {
            hasPrevious = false;
        }

        if (perPage !== 0) {
            const skip = page * perPage;
            const take = perPage;

            queryArgs.skip = skip;
            queryArgs.take = take;
        }

        const evseConnectors = await databaseService.prisma.eVSEConnector.findMany(queryArgs);

        // Check if there's a next page
        let hasNext = false;
        if (perPage > 0 && evseConnectors.length > 0 && evseConnectors.length <= perPage) {
            hasNext = true;
        }

        return {
            records: evseConnectors,
            has_next: hasNext,
            has_previous: hasPrevious,
        };
    }

    public static async getById(
        evseConnectorId: string,
        args: Prisma.EVSEConnectorFindFirstArgs = {}
    ): Promise<(EVSEConnector & { evse?: EVSE & { location?: Location } }) | null> {
        const evseConnector = await databaseService.prisma.eVSEConnector.findFirst({
            where: { id: evseConnectorId, deleted: false },
            ...args,
        });

        return evseConnector as EVSEConnector | null;
    }

    public static async getByConnectorId(
        connectorId: string,
        args: Prisma.EVSEConnectorFindFirstArgs = {}
    ): Promise<(EVSEConnector & { evse?: EVSE & { location?: Location } }) | null> {
        const evseConnector = await databaseService.prisma.eVSEConnector.findFirst({
            where: {
                connector_id: connectorId,
                deleted: false,
            },
            ...args,
        });

        return evseConnector;
    }

}