import { Request } from 'express';
import { CDR as PrismaCDR, Prisma } from '@prisma/client';
import { HttpResponse } from '../../../../../types/responses';
import { OCPICDRResponse, OCPICDRsResponse } from '../../../../schema/modules/cdrs/types/responses';
import { OCPICDR } from '../../../../schema/modules/cdrs/types';
import { databaseService } from '../../../../../services/database.service';
import { OCPIResponseStatusCode } from '../../../../schema/general/enum';
import Utils from '../../../../../utils/Utils';

/**
 * OCPI 2.2.1 – CDRs module (incoming, EMSP side).
 *
 * CPO → EMSP (Receiver interface):
 * - GET  /cdrs
 * - GET  /cdrs/{cdr_id}
 * - POST /cdrs
 */
export default class OCPIv221CDRsModuleIncomingRequestService {
    /**
     * GET /cdrs
     *
     * Optional OCPI endpoint to list CDRs.
     * Supports date_from/date_to, country_code, party_id, offset, limit.
     */
    public static async handleGetCDRs(
        req: Request,
    ): Promise<HttpResponse<OCPICDRsResponse>> {
        const prisma = databaseService.prisma;

        const {
            country_code,
            party_id,
            date_from,
            date_to,
            offset,
            limit,
        } = req.query as {
            country_code?: string;
            party_id?: string;
            date_from?: string;
            date_to?: string;
            offset?: string;
            limit?: string;
        };

        const where: Prisma.CDRWhereInput = {
            deleted: false,
        };

        if (country_code) {
            where.country_code = country_code;
        }
        if (party_id) {
            where.party_id = party_id;
        }
        if (date_from || date_to) {
            where.last_updated = {};
            if (date_from) {
                where.last_updated.gte = new Date(date_from);
            }
            if (date_to) {
                where.last_updated.lte = new Date(date_to);
            }
        }

        const skip = offset ? Number(offset) : 0;
        const take = limit ? Number(limit) : undefined;

        const cdrs = await prisma.cDR.findMany({
            where,
            orderBy: { last_updated: 'desc' },
            skip,
            take,
        });

        const data: OCPICDR[] = cdrs.map(
            OCPIv221CDRsModuleIncomingRequestService.mapPrismaCdrToOcpi,
        );

        return {
            httpStatus: 200,
            payload: {
                data,
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            },
        };
    }

    /**
     * GET /cdrs/{cdr_id}
     */
    public static async handleGetCDR(
        req: Request,
    ): Promise<HttpResponse<OCPICDRResponse>> {
        const prisma = databaseService.prisma;
        const { cdr_id } = req.params as { cdr_id: string };

        const cdr = await prisma.cDR.findFirst({
            where: {
                ocpi_cdr_id: cdr_id,
                deleted: false,
            },
        });

        if (!cdr) {
            return {
                httpStatus: 404,
                payload: {
                    status_code: OCPIResponseStatusCode.status_2001,
                    status_message: 'CDR not found',
                    timestamp: new Date().toISOString(),
                },
            };
        }

        const data = OCPIv221CDRsModuleIncomingRequestService.mapPrismaCdrToOcpi(cdr);

        return {
            httpStatus: 200,
            payload: {
                data,
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            },
        };
    }

    /**
     * POST /cdrs
     *
     * CPO pushes a new CDR.
     */
    public static async handlePostCDR(
        req: Request,
    ): Promise<HttpResponse<OCPICDRResponse>> {
        const prisma = databaseService.prisma;
        const payload = req.body as OCPICDR;

        if (!payload) {
            return {
                httpStatus: 400,
                payload: {
                    status_code: OCPIResponseStatusCode.status_2000,
                    status_message: 'CDR payload is required',
                    timestamp: new Date().toISOString(),
                },
            };
        }

        // Resolve OCPI partner from Authorization header (CPO token)
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Token ')) {
            return {
                httpStatus: 401,
                payload: {
                    status_code: OCPIResponseStatusCode.status_2001,
                    status_message: 'Unauthorized',
                    timestamp: new Date().toISOString(),
                },
            };
        }

        const cpoAuthToken = authHeader.substring('Token '.length);
        const partnerCredentials = await Utils.findPartnerCredentialsUsingCPOAuthToken(cpoAuthToken);

        if (!partnerCredentials) {
            return {
                httpStatus: 401,
                payload: {
                    status_code: OCPIResponseStatusCode.status_2001,
                    status_message: 'Unauthorized',
                    timestamp: new Date().toISOString(),
                },
            };
        }

        const partnerId = partnerCredentials.partner_id;

        // Upsert by (country_code, party_id, id)
        const existing = await prisma.cDR.findFirst({
            where: {
                country_code: payload.country_code,
                party_id: payload.party_id,
                ocpi_cdr_id: payload.id,
            },
        });

        const dataForDb =
            OCPIv221CDRsModuleIncomingRequestService.mapOcpiCdrToPrisma(payload, partnerId);

        let stored: PrismaCDR;
        if (existing) {
            stored = await prisma.cDR.update({
                where: { id: existing.id },
                data: dataForDb,
            });
        }
        else {
            stored = await prisma.cDR.create({
                data: dataForDb,
            });
        }

        const data = OCPIv221CDRsModuleIncomingRequestService.mapPrismaCdrToOcpi(stored);

        return {
            httpStatus: 200,
            payload: {
                data,
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            },
        };
    }

    private static mapPrismaCdrToOcpi(cdr: PrismaCDR): OCPICDR {
        return {
            country_code: cdr.country_code,
            party_id: cdr.party_id,
            id: cdr.ocpi_cdr_id,
            start_date_time: cdr.start_date_time.toISOString(),
            end_date_time: cdr.end_date_time.toISOString(),
            session_id: cdr.session_id ?? undefined,
            cdr_token: cdr.cdr_token as unknown as OCPICDR['cdr_token'],
            auth_method: cdr.auth_method as OCPICDR['auth_method'],
            authorization_reference: cdr.authorization_reference ?? undefined,
            cdr_location: cdr.cdr_location as unknown as OCPICDR['cdr_location'],
            meter_id: cdr.meter_id ?? undefined,
            currency: cdr.currency,
            tariffs: (cdr.tariffs as unknown as OCPICDR['tariffs']) || undefined,
            charging_periods:
                cdr.charging_periods as unknown as OCPICDR['charging_periods'],
            signed_data: (cdr.signed_data as unknown as OCPICDR['signed_data']) || undefined,
            total_cost: cdr.total_cost as unknown as OCPICDR['total_cost'],
            total_fixed_cost:
                (cdr.total_fixed_cost as unknown as OCPICDR['total_fixed_cost']) || undefined,
            total_energy: Number(cdr.total_energy),
            total_energy_cost:
                (cdr.total_energy_cost as unknown as OCPICDR['total_energy_cost']) || undefined,
            total_time: Number(cdr.total_time),
            total_time_cost:
                (cdr.total_time_cost as unknown as OCPICDR['total_time_cost']) || undefined,
            total_parking_time: cdr.total_parking_time
                ? Number(cdr.total_parking_time)
                : undefined,
            total_parking_cost:
                (cdr.total_parking_cost as unknown as OCPICDR['total_parking_cost']) || undefined,
            total_reservation_cost:
                (cdr.total_reservation_cost as unknown as OCPICDR['total_reservation_cost']) ||
                undefined,
            remark: cdr.remark ?? undefined,
            invoice_reference_id: cdr.invoice_reference_id ?? undefined,
            credit: cdr.credit ?? undefined,
            credit_reference_id: cdr.credit_reference_id ?? undefined,
            home_charging_compensation: undefined,
            last_updated: cdr.last_updated.toISOString(),
            remarks: cdr.remarks ?? undefined,
        };
    }

    private static mapOcpiCdrToPrisma(
        cdr: OCPICDR,
        partnerId: string,
    ): Prisma.CDRUncheckedCreateInput {
        return {
            country_code: cdr.country_code,
            party_id: cdr.party_id,
            ocpi_cdr_id: cdr.id,
            start_date_time: new Date(cdr.start_date_time),
            end_date_time: new Date(cdr.end_date_time),
            session_id: cdr.session_id ?? null,
            cdr_token: cdr.cdr_token as unknown as Prisma.InputJsonValue,
            auth_method: String(cdr.auth_method),
            authorization_reference: cdr.authorization_reference ?? null,
            cdr_location: cdr.cdr_location as unknown as Prisma.InputJsonValue,
            meter_id: cdr.meter_id ?? null,
            currency: cdr.currency,
            tariffs: cdr.tariffs
                ? (cdr.tariffs as unknown as Prisma.InputJsonValue)
                : undefined,
            charging_periods: cdr.charging_periods as unknown as Prisma.InputJsonValue,
            signed_data: cdr.signed_data
                ? (cdr.signed_data as unknown as Prisma.InputJsonValue)
                : undefined,
            total_cost: cdr.total_cost as unknown as Prisma.InputJsonValue,
            total_fixed_cost: cdr.total_fixed_cost
                ? (cdr.total_fixed_cost as unknown as Prisma.InputJsonValue)
                : undefined,
            total_energy: new Prisma.Decimal(cdr.total_energy),
            total_energy_cost: cdr.total_energy_cost
                ? (cdr.total_energy_cost as unknown as Prisma.InputJsonValue)
                : undefined,
            total_time: BigInt(cdr.total_time),
            total_time_cost: cdr.total_time_cost
                ? (cdr.total_time_cost as unknown as Prisma.InputJsonValue)
                : undefined,
            total_parking_time: cdr.total_parking_time != null
                ? BigInt(cdr.total_parking_time)
                : undefined,
            total_parking_cost: cdr.total_parking_cost
                ? (cdr.total_parking_cost as unknown as Prisma.InputJsonValue)
                : undefined,
            total_reservation_cost: cdr.total_reservation_cost
                ? (cdr.total_reservation_cost as unknown as Prisma.InputJsonValue)
                : undefined,
            remark: cdr.remark ?? null,
            invoice_reference_id: cdr.invoice_reference_id ?? null,
            credit: cdr.credit ?? null,
            credit_reference_id: cdr.credit_reference_id ?? null,
            remarks: cdr.remarks ?? null,
            last_updated: new Date(cdr.last_updated ?? new Date().toISOString()),
            deleted: false,
            deleted_at: null,
            created_at: undefined,
            updated_at: undefined,
            partner_id: partnerId,
            id: undefined,
        };
    }
}
