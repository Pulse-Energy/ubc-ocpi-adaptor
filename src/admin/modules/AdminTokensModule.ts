import { Request } from 'express';
import { Prisma, Token } from '@prisma/client';
import { HttpResponse } from '../../types/responses';
import { AdminResponsePayload } from '../types/responses';
import { ValidationError } from '../../utils/errors';
import { databaseService } from '../../services/database.service';
import { OCPIToken } from '../../ocpi/schema/modules/tokens/types';
import { OCPITokenResponse } from '../../ocpi/schema/modules/tokens/types/responses';
import OCPIv221TokensModuleOutgoingRequestService from '../../ocpi/modules/v2.2.1/emsp/tokens/OCPIv221TokensModuleOutgoingRequestService';

/**
 * Admin Tokens module
 *
 * Responsibility:
 *  - Accept OCPI Token payloads from admin APIs
 *  - Store / update them in the local database (Prisma Token model)
 *  - Call the CPO OCPI Tokens endpoint (outgoing EMSP → CPO)
 *
 * All token payloads are exactly the OCPI 2.2.1 OCPIToken shape.
 */
export default class AdminTokensModule {
    /**
     * POST /api/admin/ocpi/tokens
     *
     * Body: OCPIToken (OCPI 2.2.1)
     *
     * Behaviour:
     *  - Upsert token into local DB (Token model)
     *  - Call CPO PUT /tokens/{country_code}/{party_id}/{token_uid}
     *  - Return the raw OCPI response from CPO wrapped in AdminResponsePayload
     */
    public static async upsertTokenAndSyncWithCPO(
        req: Request,
    ): Promise<HttpResponse<AdminResponsePayload<OCPITokenResponse>>> {
        const { partner_id: partnerId, ...rawToken } = req.body as (OCPIToken & {
            partner_id?: string;
        });

        if (!partnerId) {
            throw new ValidationError('partner_id is required');
        }

        const tokenPayload = rawToken as OCPIToken | undefined;

        if (!tokenPayload) {
            throw new ValidationError('OCPI token payload is required');
        }

        const prisma = databaseService.prisma;

        // 1) Upsert in local DB
        const existing = await prisma.token.findFirst({
            where: {
                country_code: tokenPayload.country_code,
                party_id: tokenPayload.party_id,
                uid: tokenPayload.uid,
            },
        });

        const tokenCreateData = AdminTokensModule.mapOcpiTokenToPrisma(tokenPayload, partnerId);

        let stored: Token;
        if (existing) {
            const tokenUpdateData: Prisma.TokenUncheckedUpdateInput = {
                ...tokenCreateData,
            };
            stored = await prisma.token.update({
                where: { id: existing.id },
                data: tokenUpdateData,
            });
        }
        else {
            stored = await prisma.token.create({
                data: tokenCreateData,
            });
        }

        // 2) Resolve CPO partner credentials and call CPO Tokens endpoint (PUT)
        const partner = await prisma.oCPIPartner.findUnique({
            where: { id: partnerId },
            include: { credentials: true },
        });

        if (!partner || partner.deleted) {
            throw new ValidationError('OCPI partner not found');
        }

        const creds = partner.credentials;
        if (!creds || !creds.cpo_auth_token) {
            throw new ValidationError('OCPI partner credentials (cpo_auth_token) not configured');
        }

        const cpoResponse = await OCPIv221TokensModuleOutgoingRequestService.sendPutTokenDirect(
            AdminTokensModule.mapPrismaTokenToOcpi(stored),
            creds.cpo_auth_token,
            partnerId,
        );

        return {
            httpStatus: cpoResponse.httpStatus,
            payload: {
                data: cpoResponse.payload,
            },
        };
    }

    private static mapPrismaTokenToOcpi(token: Token): OCPIToken {
        return {
            country_code: token.country_code,
            party_id: token.party_id,
            uid: token.uid,
            type: token.type as unknown as OCPIToken['type'],
            contract_id: token.contract_id,
            visual_number: token.visual_number ?? undefined,
            issuer: token.issuer,
            group_id: token.group_id ?? undefined,
            valid: token.valid,
            whitelist: token.whitelist as unknown as OCPIToken['whitelist'],
            language: token.language ?? undefined,
            default_profile_type:
                (token.default_profile_type as unknown as OCPIToken['default_profile_type']) ||
                undefined,
            energy_contract: token.energy_contract as unknown as OCPIToken['energy_contract'],
            last_updated: token.last_updated.toISOString(),
        };
    }

    private static mapOcpiTokenToPrisma(
        token: OCPIToken,
        partnerId: string,
    ): Prisma.TokenUncheckedCreateInput {
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
            default_profile_type: token.default_profile_type
                ? String(token.default_profile_type)
                : null,
            energy_contract: token.energy_contract
                ? (token.energy_contract as unknown as Prisma.InputJsonValue)
                : Prisma.DbNull,
            last_updated: new Date(token.last_updated ?? new Date().toISOString()),
            deleted: false,
            partner_id: partnerId,
        };
    }
}


