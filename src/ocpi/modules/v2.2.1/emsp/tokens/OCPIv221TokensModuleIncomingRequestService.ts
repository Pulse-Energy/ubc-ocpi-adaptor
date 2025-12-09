import { Request } from 'express';
import { Token } from '@prisma/client';
import { HttpResponse } from '../../../../../types/responses';
import {
    OCPIAuthorizationInfoResponse,
    OCPITokenResponse,
    OCPITokensResponse,
} from '../../../../schema/modules/tokens/types/responses';
import { databaseService } from '../../../../../services/database.service';
import { OCPIToken } from '../../../../schema/modules/tokens/types';
import { OCPIResponseStatusCode } from '../../../../schema/general/enum';
import Utils from '../../../../../utils/Utils';

/**
 * Handle all incoming requests for the Tokens module from the CPO
 */
export default class OCPIv221TokensModuleIncomingRequestService {

    // get requests

    /**
     * GET /ocpi/tokens
     *
     * Returns all non-deleted tokens, optionally filtered by country_code / party_id.
     */
    public static async handleGetTokens(req: Request): Promise<HttpResponse<OCPITokensResponse>> {
        const { country_code, party_id } = req.query as { country_code?: string; party_id?: string };

        const where: { deleted: boolean; country_code?: string; party_id?: string } = {
            deleted: false,
        };
        if (country_code) {
            where.country_code = country_code;
        }
        if (party_id) {
            where.party_id = party_id;
        }

        const prismaTokens = await databaseService.prisma.token.findMany({
            where,
            orderBy: {
                last_updated: 'desc',
            },
        });

        const data: OCPIToken[] = prismaTokens.map(OCPIv221TokensModuleIncomingRequestService.mapPrismaTokenToOcpi);

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
     * GET /ocpi/tokens/:country_code/:party_id/:token_uid
     *
     * Returns a single token.
     */
    public static async handleGetToken(req: Request): Promise<HttpResponse<OCPITokenResponse>> {
        const { country_code, party_id, token_uid } = req.params as {
            country_code: string;
            party_id: string;
            token_uid: string;
        };

        const prismaToken = await databaseService.prisma.token.findFirst({
            where: {
                country_code,
                party_id,
                uid: token_uid,
                deleted: false,
            },
        });

        if (!prismaToken) {
            return {
                httpStatus: 404,
                payload: {
                    status_code: OCPIResponseStatusCode.status_2001,
                    status_message: 'Token not found',
                    timestamp: new Date().toISOString(),
                },
            };
        }

        const data = OCPIv221TokensModuleIncomingRequestService.mapPrismaTokenToOcpi(prismaToken);

        return {
            httpStatus: 200,
            payload: {
                data,
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            },
        };
    }

    // post requests

    public static async handlePostAuthorizeToken(): Promise<HttpResponse<OCPIAuthorizationInfoResponse>> {
        // Full authorization logic is out of scope for now.
        // We just acknowledge the request with an empty 1000 response.
        return {
            httpStatus: 200,
            payload: {
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            },
        };
    }

    // put requests

    /**
     * PUT /ocpi/tokens/:country_code/:party_id/:token_uid
     *
     * Creates or fully replaces a token.
     */
    public static async handlePutToken(req: Request): Promise<HttpResponse<OCPITokenResponse>> {
        const { country_code, party_id, token_uid } = req.params as {
            country_code: string;
            party_id: string;
            token_uid: string;
        };
        const payload = req.body as OCPIToken;

        if (!payload || payload.country_code !== country_code || payload.party_id !== party_id || payload.uid !== token_uid) {
            return {
                httpStatus: 400,
                payload: {
                    status_code: OCPIResponseStatusCode.status_2000,
                    status_message: 'Path parameters and token payload must match',
                    timestamp: new Date().toISOString(),
                },
            };
        }

        const prisma = databaseService.prisma;

        const existing = await prisma.token.findFirst({
            where: {
                country_code,
                party_id,
                uid: token_uid,
            },
        });
        const emspPartner = await Utils.findEmspPartner();
        if (!emspPartner) {
            throw new Error('EMSP partner not configured');
        }

        const tokenData = OCPIv221TokensModuleIncomingRequestService.mapOcpiTokenToPrisma(
            payload,
            emspPartner.id,
        );

        let stored: Token;
        if (existing) {
            stored = await prisma.token.update({
                where: { id: existing.id },
                data: tokenData,
            });
        }
        else {
            stored = await prisma.token.create({
                data: tokenData,
            });
        }

        const data = OCPIv221TokensModuleIncomingRequestService.mapPrismaTokenToOcpi(stored);

        return {
            httpStatus: 200,
            payload: {
                data,
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            },
        };
    }

    // patch requests

    /**
     * PATCH /ocpi/tokens/:country_code/:party_id/:token_uid
     *
     * Applies a partial update to an existing token.
     */
    public static async handlePatchToken(req: Request): Promise<HttpResponse<OCPITokenResponse>> {
        const { country_code, party_id, token_uid } = req.params as {
            country_code: string;
            party_id: string;
            token_uid: string;
        };
        const patch = req.body as Partial<OCPIToken>;

        const prisma = databaseService.prisma;

        const existing = await prisma.token.findFirst({
            where: {
                country_code,
                party_id,
                uid: token_uid,
                deleted: false,
            },
        });

        if (!existing) {
            return {
                httpStatus: 404,
                payload: {
                    status_code: OCPIResponseStatusCode.status_2001,
                    status_message: 'Token not found',
                    timestamp: new Date().toISOString(),
                },
            };
        }

        const merged: OCPIToken = {
            ...OCPIv221TokensModuleIncomingRequestService.mapPrismaTokenToOcpi(existing),
            ...patch,
            last_updated: patch.last_updated ?? new Date().toISOString(),
        };
        const emspPartner = await Utils.findEmspPartner();
        if (!emspPartner) {
            throw new Error('EMSP partner not configured');
        }

        const tokenData = OCPIv221TokensModuleIncomingRequestService.mapOcpiTokenToPrisma(
            merged,
            emspPartner.id,
        );

        const stored = await prisma.token.update({
            where: { id: existing.id },
            data: tokenData,
        });

        const data = OCPIv221TokensModuleIncomingRequestService.mapPrismaTokenToOcpi(stored);

        return {
            httpStatus: 200,
            payload: {
                data,
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            },
        };
    }

    private static mapPrismaTokenToOcpi(token: Token): OCPIToken {
        return {
            country_code: token.country_code,
            party_id: token.party_id,
            uid: token.uid,
            type: token.type as any,
            contract_id: token.contract_id,
            visual_number: token.visual_number ?? undefined,
            issuer: token.issuer,
            group_id: token.group_id ?? undefined,
            valid: token.valid,
            whitelist: token.whitelist as any,
            language: token.language ?? undefined,
            default_profile_type: token.default_profile_type as any || undefined,
            energy_contract: token.energy_contract as any || undefined,
            last_updated: token.last_updated.toISOString(),
        };
    }

    private static mapOcpiTokenToPrisma(token: OCPIToken, partnerId: string) {
        return {
            country_code: token.country_code,
            party_id: token.party_id,
            uid: token.uid,
            type: String(token.type),
            contract_id: token.contract_id,
            visual_number: token.visual_number ?? null,
            issuer: token.issuer,
            group_id: token.group_id ?? null,
            valid: token.valid,
            whitelist: String(token.whitelist),
            language: token.language ?? null,
            default_profile_type: token.default_profile_type ? String(token.default_profile_type) : null,
            energy_contract: token.energy_contract as any ?? undefined,
            last_updated: new Date(token.last_updated ?? new Date().toISOString()),
            deleted: false,
            partner_id: partnerId,
        };
    }

}

