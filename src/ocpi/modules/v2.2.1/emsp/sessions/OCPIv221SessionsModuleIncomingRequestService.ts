import { Request } from 'express';
import { Session as PrismaSession, Prisma, OCPIPartnerCredentials } from '@prisma/client';
import { HttpResponse } from '../../../../../types/responses';
import {
    OCPISessionResponse,
    OCPISessionsResponse,
} from '../../../../schema/modules/sessions/types/responses';
import { OCPISession, OCPIPatchSession } from '../../../../schema/modules/sessions/types';
import { databaseService } from '../../../../../services/database.service';
import { OCPIResponseStatusCode } from '../../../../schema/general/enum';
import { OCPISessionStatus } from '../../../../schema/modules/sessions/enums';
import { OCPIAuthMethod } from '../../../../schema/modules/cdrs/enums';

/**
 * OCPI 2.2.1 – Sessions module (incoming, EMSP side).
 *
 * CPO → EMSP (Receiver interface):
 * - GET   /sessions
 * - GET   /sessions/{country_code}/{party_id}/{session_id}
 * - PUT   /sessions/{country_code}/{party_id}/{session_id}
 * - PATCH /sessions/{country_code}/{party_id}/{session_id}
 */
export default class OCPIv221SessionsModuleIncomingRequestService {
    /**
     * GET /sessions
     *
     * Optional OCPI endpoint to list sessions.
     * Supports date_from/date_to, country_code, party_id, offset, limit.
     */
    public static async handleGetSessions(
        req: Request,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPISessionsResponse>> {
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

        const where: Prisma.SessionWhereInput = {
            deleted: false,
            partner_id: partnerCredentials.partner_id,
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

        const sessions = await prisma.session.findMany({
            where,
            orderBy: { last_updated: 'desc' },
            skip,
            take,
        });

        const data: OCPISession[] = sessions.map(
            OCPIv221SessionsModuleIncomingRequestService.mapPrismaSessionToOcpi,
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
     * GET /sessions/{country_code}/{party_id}/{session_id}
     */
    public static async handleGetSession(
        req: Request,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPISessionResponse>> {
        const prisma = databaseService.prisma;
        const { country_code, party_id, session_id } = req.params as {
            country_code: string;
            party_id: string;
            session_id: string;
        };

        const session = await prisma.session.findFirst({
            where: {
                country_code,
                party_id,
                cpo_session_id: session_id,
                deleted: false,
                partner_id: partnerCredentials.partner_id,
            },
        });

        if (!session) {
            return {
                httpStatus: 404,
                payload: {
                    status_code: OCPIResponseStatusCode.status_2001,
                    status_message: 'Session not found',
                    timestamp: new Date().toISOString(),
                },
            };
        }

        const data = OCPIv221SessionsModuleIncomingRequestService.mapPrismaSessionToOcpi(
            session,
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
     * PUT /sessions/{country_code}/{party_id}/{session_id}
     *
     * Create or fully replace a session.
     */
    public static async handlePutSession(
        req: Request,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPISessionResponse>> {
        const prisma = databaseService.prisma;
        const { country_code, party_id, session_id } = req.params as {
            country_code: string;
            party_id: string;
            session_id: string;
        };

        const payload = req.body as OCPISession;

        if (
            !payload ||
            payload.country_code !== country_code ||
            payload.party_id !== party_id ||
            payload.id !== session_id
        ) {
            return {
                httpStatus: 400,
                payload: {
                    status_code: OCPIResponseStatusCode.status_2000,
                    status_message: 'Path parameters and session payload must match',
                    timestamp: new Date().toISOString(),
                },
            };
        }

        const existing = await prisma.session.findFirst({
            where: {
                authorization_reference: payload.authorization_reference,
                partner_id: partnerCredentials.partner_id,
                deleted: false,
            },
        });

        const partnerId = partnerCredentials.partner_id;

        const createData =
            OCPIv221SessionsModuleIncomingRequestService.mapOcpiSessionToPrisma(
                payload,
                partnerId,
            );

        let stored: PrismaSession;
        if (existing) {
            const updateData: Prisma.SessionUncheckedUpdateInput = {
                ...createData,
            };
            stored = await prisma.session.update({
                where: { id: existing.id },
                data: updateData,
            });
        }
        else {
            stored = await prisma.session.create({
                data: createData,
            });
        }

        const data =
            OCPIv221SessionsModuleIncomingRequestService.mapPrismaSessionToOcpi(stored);

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
     * PATCH /sessions/{country_code}/{party_id}/{session_id}
     *
     * Partial update of an existing session.
     *
     * Some CPOs may send PATCH as the first message (no prior PUT).
     * In that case, if the payload contains a full OCPI Session object,
     * we treat it as an upsert and create the Session.
     */
    public static async handlePatchSession(
        req: Request,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPISessionResponse>> {
        const prisma = databaseService.prisma;
        const { country_code, party_id, session_id } = req.params as {
            country_code: string;
            party_id: string;
            session_id: string;
        };

        const patch = req.body as OCPIPatchSession;

        // Try finding the session by the session_id
        let existing = await prisma.session.findFirst({
            where: {
                cpo_session_id: session_id,
                deleted: false,
                partner_id: partnerCredentials.partner_id
            },
        });

        if (!existing) {
            // Try finding using authorization_reference
            existing = await prisma.session.findFirst({
                where: {
                    authorization_reference: patch.authorization_reference,
                    deleted: false,
                    partner_id: partnerCredentials.partner_id
                },
            });
        }

        if (!existing) {
            return {
                httpStatus: 404,
                payload: {
                    status_code: OCPIResponseStatusCode.status_2001,
                    timestamp: new Date().toISOString(),
                },
            };
        }

        // Session exists, do a normal merge+update
        const current =
            OCPIv221SessionsModuleIncomingRequestService.mapPrismaSessionToOcpi(existing);

        const merged: OCPISession = {
            ...current,
            ...patch,
            last_updated: patch.last_updated ?? new Date().toISOString(),
        };

        const dataForDb =
            OCPIv221SessionsModuleIncomingRequestService.mapOcpiSessionToPrisma(
                merged,
                partnerCredentials.partner_id,
            );

        const stored = await prisma.session.update({
            where: { id: existing.id },
            data: dataForDb,
        });

        const data =
            OCPIv221SessionsModuleIncomingRequestService.mapPrismaSessionToOcpi(stored);

        return {
            httpStatus: 200,
            payload: {
                data,
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            },
        };
    }

    private static mapPrismaSessionToOcpi(session: PrismaSession): OCPISession {
        return {
            country_code: session?.country_code ?? undefined,
            party_id: session?.party_id ?? undefined,
            id: session?.cpo_session_id ?? '',
            start_date_time: session?.start_date_time?.toISOString() ?? undefined,
            end_date_time: session?.end_date_time?.toISOString() ?? undefined,
            kwh: Number(session?.kwh ?? 0),
            cdr_token: session?.cdr_token as unknown as OCPISession['cdr_token'],
            auth_method: session?.auth_method as OCPIAuthMethod,
            authorization_reference: session.authorization_reference ?? undefined,
            location_id: session?.location_id ?? undefined,
            evse_uid: session?.evse_uid ?? undefined,
            connector_id: session?.connector_id ?? undefined,
            meter_id: session?.meter_id ?? undefined,
            currency: session?.currency ?? undefined,
            charging_periods:
                (session?.charging_periods as unknown as OCPISession['charging_periods']) ||
                undefined,
            total_cost: (session?.total_cost as unknown as OCPISession['total_cost']) || undefined,
            status: session?.status as OCPISession['status'],
            last_updated: session?.last_updated?.toISOString() ?? undefined,
        };
    }

    private static mapOcpiSessionToPrisma(
        session: OCPISession,
        partnerId: string,
    ): Prisma.SessionUncheckedCreateInput {
        return {
            country_code: session.country_code,
            party_id: session.party_id,
            cpo_session_id: session.id,
            start_date_time: session.start_date_time ? new Date(session.start_date_time) : null,
            end_date_time: session.end_date_time ? new Date(session.end_date_time) : null,
            kwh: new Prisma.Decimal(session.kwh),
            cdr_token: session.cdr_token as unknown as Prisma.InputJsonValue,
            auth_method: String(session.auth_method),
            authorization_reference: session.authorization_reference ?? null,
            location_id: session.location_id,
            evse_uid: session.evse_uid,
            connector_id: session.connector_id,
            meter_id: session.meter_id ?? null,
            currency: session.currency,
            charging_periods: session.charging_periods
                ? (session.charging_periods as unknown as Prisma.InputJsonValue)
                : undefined,
            total_cost: session.total_cost
                ? (session.total_cost as unknown as Prisma.InputJsonValue)
                : undefined,
            status: String(session.status),
            last_updated: new Date(session.last_updated ?? new Date().toISOString()),
            deleted: false,
            deleted_at: null,
            created_at: undefined,
            updated_at: undefined,
            partner_id: partnerId,
            id: undefined,
        };
    }
}
