import { Request, Response } from 'express';
import { OCPIPartnerCredentials, Token } from '@prisma/client';
import { HttpResponse } from '../../../../../types/responses';
import {
    OCPIAuthorizationInfoResponse,
    OCPITokenResponse,
    OCPITokensResponse,
} from '../../../../schema/modules/tokens/types/responses';
import { databaseService } from '../../../../../services/database.service';
import { OCPIAuthorizationInfo, OCPILocationReferences, OCPIToken } from '../../../../schema/modules/tokens/types';
import { OCPIAllowedType, OCPIWhitelistType } from '../../../../schema/modules/tokens/enums';
import { OCPIResponseStatusCode } from '../../../../schema/general/enum';
import { OCPIRequestLogService } from '../../../../services/OCPIRequestLogService';
import { OCPILogCommand } from '../../../../types';
import { TokenService } from './TokenService';
import { isEmpty } from 'lodash';

/**
 * OCPI 2.2.1 – Tokens module (incoming, EMSP side).
 *
 * Endpoints implemented as in the OCPI spec:
 * - GET    /tokens
 * - GET    /tokens/{country_code}/{party_id}/{token_uid}
 * - PUT    /tokens/{country_code}/{party_id}/{token_uid}
 * - PATCH  /tokens/{country_code}/{party_id}/{token_uid}
 * - POST   /tokens/{country_code}/{party_id}/{token_uid}/authorize
 *
 * All responses use the standard OCPI response envelope.
 */
export default class OCPIv221TokensModuleIncomingRequestService {

    /**
     * GET /tokens
     *
     * Optional OCPI endpoint: return all tokens, optionally filtered by
     * country_code / party_id.
     */
    public static async handleGetTokens(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPITokensResponse>> {
        // Log incoming request (non-blocking)
        OCPIRequestLogService.logRequest({
            req,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.GetTokensReq,
        });

        const { country_code, party_id } = req.query as {
            country_code?: string;
            party_id?: string;
        };

        const where: {
            deleted: boolean;
            partner_id: string;
            country_code?: string;
            party_id?: string;
        } = {
            deleted: false,
            partner_id: partnerCredentials.partner_id,
        };
        if (country_code) {
            where.country_code = country_code;
        }
        if (party_id) {
            where.party_id = party_id;
        }

        const prismaTokens = await databaseService.prisma.token.findMany({
            where,
            orderBy: { last_updated: 'desc' },
        });

        const data: OCPIToken[] = prismaTokens.map(
            OCPIv221TokensModuleIncomingRequestService.mapPrismaTokenToOcpi,
        );

        const response = {
            httpStatus: 200,
            payload: {
                data,
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            },
        };

        // Log outgoing response (non-blocking)
        OCPIRequestLogService.logResponse({
            req,
            res,
            responseBody: response.payload,
            statusCode: response.httpStatus,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.GetTokensRes,
        });

        return response;
    }

    /**
     * GET /tokens/{country_code}/{party_id}/{token_uid}
     *
     * Returns a single token if it exists.
     */
    public static async handleGetToken(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPITokenResponse>> {
        // Log incoming request (non-blocking)
        OCPIRequestLogService.logRequest({
            req,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.GetTokenReq,
        });

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
                partner_id: partnerCredentials.partner_id,
            },
        });

        if (!prismaToken) {
            const response = {
                httpStatus: 404,
                payload: {
                    status_code: OCPIResponseStatusCode.status_2001,
                    status_message: 'Token not found',
                    timestamp: new Date().toISOString(),
                },
            };

            // Log outgoing response (non-blocking)
            OCPIRequestLogService.logResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.GetTokenRes,
            });

            return response;
        }

        const data = OCPIv221TokensModuleIncomingRequestService.mapPrismaTokenToOcpi(
            prismaToken,
        );

        const response = {
            httpStatus: 200,
            payload: {
                data,
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            },
        };

        // Log outgoing response (non-blocking)
        OCPIRequestLogService.logResponse({
            req,
            res,
            responseBody: response.payload,
            statusCode: response.httpStatus,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.GetTokenRes,
        });

        return response;
    }

    /**
     * POST /tokens/{country_code}/{party_id}/{token_uid}/authorize
     *
     * CPO asks the EMSP if a token may be used for starting a session at a specific location.
     * 
     * According to OCPI 2.2.1:
     * - Request body: OCPILocationReferences (location_id required, evse_uids optional)
     * - If token is unknown → HTTP 404 (Not Found)
     * - If token exists → return authorization info with allowed status
     * 
     * Authorization logic:
     * - Token must exist and be valid
     * - Whitelist type determines if token is allowed:
     *   - ALWAYS: Always allowed
     *   - ALLOWED: Allowed (online authorization)
     *   - ALLOWED_OFFLINE: Allowed offline
     *   - NEVER: Never allowed
     */
    public static async handlePostToken(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIAuthorizationInfoResponse>> {
        // Log incoming request (non-blocking)
        OCPIRequestLogService.logRequest({
            req,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.PostAuthorizeTokenReq,
        });

        const { country_code, party_id, token_uid } = req.params as {
            country_code: string;
            party_id: string;
            token_uid: string;
        };

        // Request body should be OCPILocationReferences
        const locationReferences = req.body as OCPILocationReferences | undefined;

        // Validate request body if provided
        if (locationReferences && !locationReferences.location_id) {
            const response = {
                httpStatus: 400,
                payload: {
                    status_code: OCPIResponseStatusCode.status_2000,
                    status_message: 'location_id is required in request body',
                    timestamp: new Date().toISOString(),
                },
            };

            // Log outgoing response (non-blocking)
            OCPIRequestLogService.logResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PostAuthorizeTokenRes,
            });

            return response;
        }

        const prismaToken = await databaseService.prisma.token.findFirst({
            where: {
                country_code,
                party_id,
                uid: token_uid,
                deleted: false,
                partner_id: partnerCredentials.partner_id,
            },
        });

        // According to OCPI 2.2.1: If token is unknown, return 404 with status_2002
        if (!prismaToken) {
            const response = {
                httpStatus: 404,
                payload: {
                    status_code: OCPIResponseStatusCode.status_2002, // Unknown token
                    status_message: 'Token not found',
                    timestamp: new Date().toISOString(),
                },
            };

            // Log outgoing response (non-blocking)
            OCPIRequestLogService.logResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PostAuthorizeTokenRes,
            });

            return response;
        }

        // Map Prisma token to OCPI token
        const token = OCPIv221TokensModuleIncomingRequestService.mapPrismaTokenToOcpi(
            prismaToken,
        );

        // Determine authorization status based on token validity, expiry, and whitelist
        // Note: Token model doesn't currently have expiry_date field, so expiry check is skipped
        // If expiry_date is added to the schema in the future, check it here:
        // if (prismaToken.expiry_date && prismaToken.expiry_date < new Date()) {
        //     allowed = OCPIAllowedType.NOT_ALLOWED;
        // }
        let allowed: OCPIAllowedType = OCPIAllowedType.NOT_ALLOWED;

        // Check token validity first
        if (prismaToken.valid) {
            // Token is valid, check whitelist type
            const whitelistType = prismaToken.whitelist as OCPIWhitelistType;
            
            switch (whitelistType) {
                case OCPIWhitelistType.ALWAYS:
                case OCPIWhitelistType.ALLOWED:
                    allowed = OCPIAllowedType.ALLOWED;
                    break;
                case OCPIWhitelistType.ALLOWED_OFFLINE:
                    // ALLOWED_OFFLINE: Token is allowed when CPO is offline
                    // For simplicity, we treat it as ALLOWED (common implementation)
                    // In a production system, you might check CPO online status via:
                    // - Request header (e.g., 'x-ocpi-cpo-online')
                    // - Partner metadata
                    // - Real-time connectivity check
                    allowed = OCPIAllowedType.ALLOWED;
                    break;
                case OCPIWhitelistType.NEVER:
                    allowed = OCPIAllowedType.NOT_ALLOWED;
                    break;
                default:
                    // Default to NOT_ALLOWED for unknown whitelist types
                    allowed = OCPIAllowedType.NOT_ALLOWED;
            }
        }

        // Calculate cache_until: CPO can cache this authorization decision for 5 minutes
        // This helps reduce authorization requests for the same token
        const cacheUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

        const info: OCPIAuthorizationInfo = {
            allowed,
            token,
            location: locationReferences, // Include location references from request (optional per spec)
            cache_until: cacheUntil, // Recommended: tells CPO how long to cache this authorization decision
        };

        const response = {
            httpStatus: 200,
            payload: {
                data: info,
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            },
        };

        // Log outgoing response (non-blocking)
        OCPIRequestLogService.logResponse({
            req,
            res,
            responseBody: response.payload,
            statusCode: response.httpStatus,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.PostAuthorizeTokenRes,
        });

        return response;
    }

    /**
     * PUT /tokens/{country_code}/{party_id}/{token_uid}
     *
     * Creates or fully replaces a token.
     */
    public static async handlePutToken(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPITokenResponse>> {
        // Log incoming request (non-blocking)
        OCPIRequestLogService.logRequest({
            req,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.PutTokenReq,
        });

        const { country_code, party_id, token_uid } = req.params as {
            country_code: string;
            party_id: string;
            token_uid: string;
        };
        const payload = req.body as OCPIToken;

        const prisma = databaseService.prisma;

        const existing = await prisma.token.findFirst({
            where: {
                country_code,
                party_id,
                uid: token_uid,
                deleted: false,
                partner_id: partnerCredentials.partner_id,
            },
        });

        let stored: Token;
        if (!existing) {
            // Create token if it doesn't exist - only include fields present in payload
            const tokenCreateFields = TokenService.buildTokenCreateFields(payload, partnerCredentials.partner_id);
            stored = await prisma.token.create({
                data: tokenCreateFields,
            });
        }
        else {
            // Build update fields - only include fields present in payload that have changed
            const tokenUpdateFields = TokenService.buildTokenUpdateFields(payload, existing);
            // Only update if there are changes
            if (!isEmpty(tokenUpdateFields)) {
                stored = await prisma.token.update({
                    where: { id: existing.id },
                    data: tokenUpdateFields,
                });
            }
            else {
                stored = existing;
            }
        }

        const data = OCPIv221TokensModuleIncomingRequestService.mapPrismaTokenToOcpi(
            stored,
        );

        const response = {
            httpStatus: 200,
            payload: {
                data,
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            },
        };

        // Log outgoing response (non-blocking)
        OCPIRequestLogService.logResponse({
            req,
            res,
            responseBody: response.payload,
            statusCode: response.httpStatus,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.PutTokenRes,
        });

        return response;
    }

    /**
     * PATCH /tokens/{country_code}/{party_id}/{token_uid}
     *
     * Applies a partial update to an existing token.
     */
    public static async handlePatchToken(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPITokenResponse>> {
        // Log incoming request (non-blocking)
        OCPIRequestLogService.logRequest({
            req,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.PatchTokenReq,
        });

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
                partner_id: partnerCredentials.partner_id,
            },
        });

        if (!existing) {
            const response = {
                httpStatus: 404,
                payload: {
                    status_code: OCPIResponseStatusCode.status_2001,
                    status_message: 'Token not found',
                    timestamp: new Date().toISOString(),
                },
            };

            // Log outgoing response (non-blocking)
            OCPIRequestLogService.logResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PatchTokenRes,
            });

            return response;
        }

        // Build update fields - only include fields present in payload that have changed
        const tokenUpdateFields = TokenService.buildTokenUpdateFields(patch as OCPIToken, existing);

        // Only update if there are changes
        let stored = existing;
        if (!isEmpty(tokenUpdateFields)) {
            stored = await prisma.token.update({
                where: { id: existing.id },
                data: tokenUpdateFields,
            });
        }

        const data = OCPIv221TokensModuleIncomingRequestService.mapPrismaTokenToOcpi(
            stored,
        );

        const response = {
            httpStatus: 200,
            payload: {
                data,
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            },
        };

        // Log outgoing response (non-blocking)
        OCPIRequestLogService.logResponse({
            req,
            res,
            responseBody: response.payload,
            statusCode: response.httpStatus,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.PatchTokenRes,
        });

        return response;
    }

    private static mapPrismaTokenToOcpi(token: Token): OCPIToken {
        return {
            country_code: token.country_code,
            party_id: token.party_id,
            uid: token.uid,
            type: token.type as never,
            contract_id: token.contract_id,
            visual_number: token.visual_number ?? undefined,
            issuer: token.issuer,
            group_id: token.group_id ?? undefined,
            valid: token.valid,
            whitelist: token.whitelist as never,
            language: token.language ?? undefined,
            default_profile_type: (token.default_profile_type as never) || undefined,
            energy_contract: token.energy_contract as never,
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
            default_profile_type: token.default_profile_type
                ? String(token.default_profile_type)
                : null,
            energy_contract: (token.energy_contract as unknown) ?? undefined,
            last_updated: new Date(token.last_updated ?? new Date().toISOString()),
            deleted: false,
            partner_id: partnerId,
        };
    }
}

