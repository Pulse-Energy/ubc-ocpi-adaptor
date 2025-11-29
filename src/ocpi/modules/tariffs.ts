import { z } from 'zod';
import { databaseService } from '../../services/database.service';
import { logger } from '../../services/logger.service';
import { syncService } from '../../services/sync.service';
import { ValidationError } from '../../utils/errors';
import { OCPIResponse, OCPITariff } from '../types';
import { tariffSchema } from '../validators';

export class TariffsModule {
    async putTariff(
        tariffId: string,
        tariff: OCPITariff,
        cpoId: string
    ): Promise<OCPIResponse<OCPITariff>> {
        try {
            // Validate tariff
            tariffSchema.parse(tariff);

            // Store or update tariff in database
            await databaseService.prisma.tariff.upsert({
                where: { tariff_id: tariffId },
                create: {
                    tariff_id: tariff.id,
                    cpo_id: cpoId,
                    currency: tariff.currency,
                    elements: tariff.elements as any,
                    last_updated: new Date(tariff.last_updated),
                },
                update: {
                    currency: tariff.currency,
                    elements: tariff.elements as any,
                    last_updated: new Date(tariff.last_updated),
                },
            });

            logger.info('Tariff stored/updated', { tariffId, cpoId });

            // Trigger CDS sync for this tariff
            await syncService.syncTariffToCDS(tariffId).catch((error) => {
                logger.error('Error syncing tariff to CDS', error, { tariffId });
                // Don't fail the request if CDS sync fails
            });

            return {
                status_code: 1000,
                data: tariff,
                timestamp: new Date().toISOString(),
            };
        }
        catch (error: any) {
            logger.error('Error putting tariff', error, { tariffId });
            if (error instanceof z.ZodError) {
                throw new ValidationError('Invalid tariff data', error.errors);
            }
            throw error;
        }
    }

    async getTariff(tariffId: string): Promise<OCPITariff | null> {
        try {
            const tariff = await databaseService.prisma.tariff.findUnique({
                where: { tariff_id: tariffId },
            });

            if (!tariff) {
                return null;
            }

            // Convert database format to OCPI format
            return this.mapToOCPITariff(tariff);
        }
        catch (error: any) {
            logger.error('Error getting tariff', error, { tariffId });
            throw error;
        }
    }

    async getTariffs(limit?: number, offset?: number): Promise<OCPITariff[]> {
        try {
            const tariffs = await databaseService.prisma.tariff.findMany({
                take: limit,
                skip: offset,
                orderBy: { last_updated: 'desc' },
            });

            return tariffs.map((tariff) => this.mapToOCPITariff(tariff));
        }
        catch (error: any) {
            logger.error('Error getting tariffs', error);
            throw error;
        }
    }

    private mapToOCPITariff(tariff: any): OCPITariff {
        return {
            country_code: 'IN', // Should be stored in DB
            party_id: '', // Should be stored in DB
            id: tariff.tariff_id,
            currency: tariff.currency,
            type: 'REGULAR', // Default type
            elements: tariff.elements as any,
            last_updated: tariff.last_updated.toISOString(),
        };
    }
}

export const tariffsModule = new TariffsModule();
