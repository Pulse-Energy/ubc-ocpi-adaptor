import { OCPIPartner, Prisma } from '@prisma/client';
import { databaseService } from '../services/database.service';

export type OCPIPartnerWithRelations = OCPIPartner;

export class OCPIPartnerDbService {
    // ==================== Basic Getters ====================

    public static async getById(
        id: string,
        args: Omit<Prisma.OCPIPartnerFindUniqueArgs, 'where'> = {},
    ): Promise<OCPIPartnerWithRelations | null> {
        const record = await databaseService.prisma.oCPIPartner.findUnique({
            where: { id },
            ...args,
        });

        return record as OCPIPartnerWithRelations | null;
    }

    public static async findFirstByFilters(
        where: Prisma.OCPIPartnerWhereInput,
        args: Omit<Prisma.OCPIPartnerFindFirstArgs, 'where'> = {},
    ): Promise<OCPIPartnerWithRelations | null> {
        const record = await databaseService.prisma.oCPIPartner.findFirst({
            where,
            ...args,
        });

        return record as OCPIPartnerWithRelations | null;
    }

    // ==================== List / Pagination Helpers ====================

    public static async getByFilters(
        queryArgs: Prisma.OCPIPartnerFindManyArgs,
        page: number = 0,
        perPage: number = 0,
        getCount: boolean = false,
    ): Promise<{
        records?: OCPIPartnerWithRelations[];
        total_count?: number;
        has_next?: boolean;
        has_previous?: boolean;
    }> {
        const countArgs: Prisma.OCPIPartnerCountArgs = {
            where: queryArgs.where,
        };

        const total = await databaseService.prisma.oCPIPartner.count(countArgs);

        if (getCount) {
            return { total_count: total };
        }

        let hasPrevious = page > 0 && total > 0;
        let hasNext = false;

        if (perPage > 0) {
            const skip = page * perPage;
            const take = perPage;
            queryArgs.skip = skip;
            queryArgs.take = take;
            hasNext = (page + 1) * perPage < total;
        }

        const records = await databaseService.prisma.oCPIPartner.findMany(queryArgs);

        return {
            records: records as OCPIPartnerWithRelations[],
            total_count: total,
            has_next: hasNext,
            has_previous: hasPrevious,
        };
    }

    public static async getByFiltersWithoutCount(
        queryArgs: Prisma.OCPIPartnerFindManyArgs,
        page: number = 0,
        perPage: number = 0,
    ): Promise<{
        records?: OCPIPartnerWithRelations[];
        has_next?: boolean;
        has_previous?: boolean;
    }> {
        let hasPrevious = page > 0;
        let hasNext = false;

        if (perPage > 0) {
            const skip = page * perPage;
            const take = perPage;
            queryArgs.skip = skip;
            queryArgs.take = take;
        }

        const records = await databaseService.prisma.oCPIPartner.findMany(queryArgs);

        if (perPage > 0 && records.length > 0 && records.length >= perPage) {
            hasNext = true;
        }

        return {
            records: records as OCPIPartnerWithRelations[],
            has_next: hasNext,
            has_previous: hasPrevious,
        };
    }

    // ==================== Mutations ====================

    public static async createPartner(
        data: Prisma.OCPIPartnerCreateArgs,
    ): Promise<OCPIPartner> {
        return databaseService.prisma.oCPIPartner.create(data);
    }

    public static async updatePartner(
        id: string,
        updateFields: Prisma.OCPIPartnerUpdateInput,
    ): Promise<OCPIPartner> {
        return databaseService.prisma.oCPIPartner.update({
            where: { id },
            data: updateFields,
        });
    }

    public static async deletePartner(id: string): Promise<OCPIPartner> {
        return databaseService.prisma.oCPIPartner.delete({
            where: { id },
        });
    }
}


