import { Request, Response } from 'express';
import { OCPIPartnerCredentials } from '@prisma/client';
import { HttpResponse } from '../../../../types/responses';
import { OCPIResponseStatusCode, OCPIRole } from '../../../schema/general/enum';
import CountryCode from '../../../schema/general/enum/country-codes';
import { OCPIResponsePayload } from '../../../schema/general/types/responses';
import {
    OCPICredentials,
    OCPICredentialsPatchRequest,
} from '../../../schema/modules/credentials/types';
import { databaseService } from '../../../../services/database.service';
import { OCPIRequestLogService } from '../../../services/OCPIRequestLogService';
import { OCPILogCommand } from '../../../types';
import { logger } from '../../../../services/logger.service';

/**
 * OCPI 2.2.1 Credentials module (incoming, EMSP side).
 *
 * File name and path follow the existing convention:
 *   src/ocpi/modules/v2.2.1/credentials/OCPIv221CredentialsModuleIncomingRequestService.ts
 */
export default class OCPIv221CredentialsModuleIncomingRequestService {
    /**
     * POST /ocpi/credentials
     *
     * NOTE: For historical reasons the router calls this "handleGetCredentials",
     * but this method is actually the handler for the POST /credentials endpoint.
     *
     * CPO calls this endpoint to send its credentials. We:
     * - Store / update the partner and its credentials in the database
     * - Generate our EMSP credentials object
     * - Return our EMSP credentials to the CPO
     */
    public static async handlePostCredentials(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<OCPICredentials>>> {
        // Log incoming request (non-blocking)
        OCPIRequestLogService.logRequest({
            req,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.PostCredentialsReq,
        });

        const incoming = req.body as OCPICredentials;

        const emspCredentials = await OCPIv221CredentialsModuleIncomingRequestService.processIncomingCredentials(
            incoming,
            partnerCredentials,
        );

        const response = {
            httpStatus: 200,
            payload: {
                data: emspCredentials,
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
            command: OCPILogCommand.PostCredentialsRes,
        });

        return response;
    }

    /**
     * GET /ocpi/credentials
     *
     * CPO calls this endpoint to retrieve this EMSP's current credentials.
     * We identify the partner by the Authorization header (Token <emsp_auth_token>).
     */
    public static async handleGetCredentials(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<OCPICredentials>>> {
        // Log incoming request (non-blocking)
        OCPIRequestLogService.logRequest({
            req,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.GetCredentialsReq,
        });

        const prisma = databaseService.prisma;

        const dbCreds = await prisma.oCPIPartnerCredentials.findUnique({
            where: { partner_id: partnerCredentials.partner_id },
        });

        if (!dbCreds) {
            const response = {
                httpStatus: 401,
                payload: {
                    status_code: OCPIResponseStatusCode.status_2001,
                    status_message: 'Unauthorized',
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
                command: OCPILogCommand.GetCredentialsRes,
            });

            return response;
        }

        const emspPartner = await prisma.oCPIPartner.findFirst({
            where: {
                role: 'EMSP',
                deleted: false,
            },
        });

        const emspCredentials: OCPICredentials = {
            token: dbCreds.emsp_auth_token || '',
            url: dbCreds.emsp_url || '',
            roles: [
                {
                    country_code: emspPartner?.country_code as CountryCode,
                    party_id: emspPartner?.party_id as string,
                    role: OCPIRole.EMSP,
                    business_details: {
                        name: emspPartner?.name || '',
                    }
                },
            ],
        };

        const response = {
            httpStatus: 200,
            payload: {
                data: emspCredentials,
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
            command: OCPILogCommand.GetCredentialsRes,
        });

        return response;
    }

    /**
     * PUT /ocpi/credentials
     *
     * CPO sends a full credentials object to replace/update its credentials.
     * Behavior is identical to POST /ocpi/credentials on the EMSP side.
     */
    public static async handlePutCredentials(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<OCPICredentials>>> {
        // Log incoming request (non-blocking)
        OCPIRequestLogService.logRequest({
            req,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.PutCredentialsReq,
        });

        const incoming = req.body as OCPICredentials;

        const emspCredentials = await OCPIv221CredentialsModuleIncomingRequestService.processIncomingCredentials(
            incoming,
            partnerCredentials,
        );

        const response = {
            httpStatus: 200,
            payload: {
                data: emspCredentials,
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
            command: OCPILogCommand.PutCredentialsRes,
        });

        return response;
    }

    /**
     * PATCH /ocpi/credentials
     *
     * CPO sends a partial credentials object to rotate its token.
     * OCPI allows only the token field to be patched for credentials.
     *
     * We:
     * - Identify the partner by Authorization header (old CPO token)
     * - Update stored cpo_auth_token to the new token
     * - Return this EMSP's credentials
     */
    public static async handlePatchCredentials(
        req: Request,
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<OCPICredentials>>> {
        // Log incoming request (non-blocking)
        OCPIRequestLogService.logRequest({
            req,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.PatchCredentialsReq,
        });

        const prisma = databaseService.prisma;

        const patch = req.body as OCPICredentialsPatchRequest;

        if (!patch) {
            const response = {
                httpStatus: 400,
                payload: {
                    status_code: OCPIResponseStatusCode.status_2000,
                    status_message: 'PATCH /credentials payload is required',
                    timestamp: new Date().toISOString(),
                },
            };

            // Log outgoing response
            try {
                const safePayload = JSON.parse(
                    JSON.stringify(response.payload, (_key, value) => (typeof value === 'bigint' ? Number(value) : value)),
                );
                await OCPIRequestLogService.logResponse({
                    req,
                    res,
                    responseBody: safePayload,
                    statusCode: response.httpStatus,
                    partnerId: partnerCredentials.partner_id,
                    command: OCPILogCommand.PatchCredentialsRes,
                });
            }
            catch (logError) {
                logger.error('Failed to persist OCPI outgoing log', logError as Error);
            }

            return response;
        }

        const existingCreds = await prisma.oCPIPartnerCredentials.findUnique({
            where: { partner_id: partnerCredentials.partner_id },
        });

        if (!existingCreds) {
            const response = {
                httpStatus: 401,
                payload: {
                    status_code: OCPIResponseStatusCode.status_2001,
                    status_message: 'Unauthorized',
                    timestamp: new Date().toISOString(),
                },
            };

            // Log outgoing response
            try {
                const safePayload = JSON.parse(
                    JSON.stringify(response.payload, (_key, value) => (typeof value === 'bigint' ? Number(value) : value)),
                );
                await OCPIRequestLogService.logResponse({
                    req,
                    res,
                    responseBody: safePayload,
                    statusCode: response.httpStatus,
                    partnerId: partnerCredentials.partner_id,
                    command: OCPILogCommand.PatchCredentialsRes,
                });
            }
            catch (logError) {
                logger.error('Failed to persist OCPI outgoing log', logError as Error);
            }

            return response;
        }

        const updatedCreds = await prisma.oCPIPartnerCredentials.update({
            where: { partner_id: existingCreds.partner_id },
            data: {
                cpo_auth_token: patch?.token || existingCreds.cpo_auth_token,
                cpo_url: patch?.url || existingCreds.cpo_url,
            },
        });

        // update cpo partner name
        const cpoRole = patch.roles?.find((role) => role.role === OCPIRole.CPO);

        if (cpoRole) {
            const partner = await prisma.oCPIPartner.findUnique({
                where: { id: existingCreds.partner_id },
            });
            await prisma.oCPIPartner.update({
                where: { id: existingCreds.partner_id },
                data: {
                    name: cpoRole.business_details?.name || '',
                    country_code: cpoRole.country_code as CountryCode,
                    party_id: cpoRole.party_id as string,
                    versions_url: patch?.url || partner?.versions_url || '',
                },
            });
        }

        const emspPartner = await prisma.oCPIPartner.findFirst({
            where: {
                role: 'EMSP',
                deleted: false,
            },
        });

        const emspCredentials: OCPICredentials = {
            token: updatedCreds.emsp_auth_token || '',
            url: updatedCreds.emsp_url || '',
            roles: [
                {
                    country_code: emspPartner?.country_code as CountryCode,
                    party_id: emspPartner?.party_id as string,
                    role: OCPIRole.EMSP,
                },
            ],
        };

        const response = {
            httpStatus: 200,
            payload: {
                data: emspCredentials,
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
                command: OCPILogCommand.PatchCredentialsRes,
            });

        return response;
    }

    /**
     * Shared worker for POST and PUT /ocpi/credentials.
     * Processes incoming CPO credentials, keeps partner + credentials in sync,
     * and returns this EMSP's credentials object.
     */
    private static async processIncomingCredentials(
        incoming: OCPICredentials,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<OCPICredentials> {
        const prisma = databaseService.prisma;

        const cpoRole = incoming.roles.find((role) => role.role === OCPIRole.CPO);

        // Basic validation: OCPI requires at least one role.
        if (!cpoRole) {
            throw new Error('At least one role is required in credentials payload');
        }

        // 3) Update CPO credentials row for this partner – store CPO token/URL.
        const updatedCreds = await prisma.oCPIPartnerCredentials.update({
            where: { partner_id: partnerCredentials.partner_id },
            data: {
                cpo_auth_token: incoming.token,
                cpo_url: incoming.url,
            },
        });

        // update cpo partner name
        await prisma.oCPIPartner.update({
            where: { id: partnerCredentials.partner_id },
            data: {
                name: cpoRole.business_details?.name || '',
                country_code: cpoRole.country_code as CountryCode,
                party_id: cpoRole.party_id as string,
                versions_url: incoming.url,
            },
        });

        const emspPartner = await prisma.oCPIPartner.findFirst({
            where: {
                role: 'EMSP',
                deleted: false,
            },
        });

        return {
            token: updatedCreds.emsp_auth_token || '',
            url: updatedCreds.emsp_url || '',
            roles: [
                {
                    country_code: emspPartner?.country_code as CountryCode,
                    party_id: emspPartner?.party_id as string,
                    role: OCPIRole.EMSP,
                    business_details: {
                        name: emspPartner?.name || '',
                    }
                },
            ],
        };
    }
}