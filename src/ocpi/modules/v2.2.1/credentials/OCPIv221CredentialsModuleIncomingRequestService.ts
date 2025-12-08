import { Request } from 'express';
import { HttpResponse } from '../../../../types/responses';
import { OCPIResponseStatusCode, OCPIRole } from '../../../schema/general/enum';
import CountryCode from '../../../schema/general/enum/country-codes';
import { OCPIResponsePayload } from '../../../schema/general/types/responses';
import { OCPICredentials, OCPICredentialsPatchRequest } from '../../../schema/modules/credentials/types';
import { databaseService } from '../../../../services/database.service';
import Utils from '../../../../utils/Utils';

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
    ): Promise<HttpResponse<OCPIResponsePayload<OCPICredentials>>> {
        const incoming = req.body as OCPICredentials;

        // Prefer identifying the partner by Authorization header (CPO token)
        const authHeader = req.headers.authorization;
        const cpoAuthToken = authHeader && authHeader.startsWith('Token ')
            ? authHeader.substring('Token '.length)
            : undefined;

        const emspCredentials = await OCPIv221CredentialsModuleIncomingRequestService.processIncomingCredentials(
            incoming,
            cpoAuthToken,
        );

        return {
            httpStatus: 200,
            payload: {
                data: emspCredentials,
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            },
        };
    }

    /**
     * GET /ocpi/credentials
     *
     * CPO calls this endpoint to retrieve this EMSP's current credentials.
     * We identify the partner by the Authorization header (Token <emsp_auth_token>).
     */
    public static async handleGetCredentials(
        req: Request,
    ): Promise<HttpResponse<OCPIResponsePayload<OCPICredentials>>> {
        const prisma = databaseService.prisma;

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

        const token = authHeader.substring('Token '.length);

        const partnerCredentials = await prisma.oCPIPartnerCredentials.findFirst({
            where: { emsp_auth_token: token },
        });

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

        const emspPartner = await prisma.oCPIPartner.findFirst({
            where: {
                role: 'EMSP',
                deleted: false,
            },
        });

        const emspCredentials: OCPICredentials = {
            token: partnerCredentials.emsp_auth_token || '',
            url: partnerCredentials.emsp_url || '',
            roles: [
                {
                    country_code: emspPartner?.country_code as CountryCode,
                    party_id: emspPartner?.party_id as string,
                    role: OCPIRole.EMSP,
                },
            ],
        };

        return {
            httpStatus: 200,
            payload: {
                data: emspCredentials,
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            },
        };
    }

    /**
     * PUT /ocpi/credentials
     *
     * CPO sends a full credentials object to replace/update its credentials.
     * Behavior is identical to POST /ocpi/credentials on the EMSP side.
     */
    public static async handlePutCredentials(
        req: Request,
    ): Promise<HttpResponse<OCPIResponsePayload<OCPICredentials>>> {
        const incoming = req.body as OCPICredentials;

        const authHeader = req.headers.authorization;
        const cpoAuthToken = authHeader && authHeader.startsWith('Token ')
            ? authHeader.substring('Token '.length)
            : undefined;

        const emspCredentials = await OCPIv221CredentialsModuleIncomingRequestService.processIncomingCredentials(
            incoming,
            cpoAuthToken,
        );

        return {
            httpStatus: 200,
            payload: {
                data: emspCredentials,
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            },
        };
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
    ): Promise<HttpResponse<OCPIResponsePayload<OCPICredentials>>> {
        const prisma = databaseService.prisma;

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

        const currentToken = authHeader.substring('Token '.length);
        const patch = req.body as OCPICredentialsPatchRequest;

        if (!patch) {
            return {
                httpStatus: 400,
                payload: {
                    status_code: OCPIResponseStatusCode.status_2000,
                    status_message: 'PATCH /credentials payload is required',
                    timestamp: new Date().toISOString(),
                },
            };
        }

        const existingCreds = await prisma.oCPIPartnerCredentials.findFirst({
            where: { cpo_auth_token: currentToken },
        });

        if (!existingCreds) {
            return {
                httpStatus: 401,
                payload: {
                    status_code: OCPIResponseStatusCode.status_2001,
                    status_message: 'Unauthorized',
                    timestamp: new Date().toISOString(),
                },
            };
        }

        const updatedCreds = await prisma.oCPIPartnerCredentials.update({
            where: { partner_id: existingCreds.partner_id },
            data: {
                cpo_auth_token: patch?.token || existingCreds.cpo_auth_token,
                cpo_url: patch?.url || existingCreds.cpo_url,
            },
        });

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

        return {
            httpStatus: 200,
            payload: {
                data: emspCredentials,
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            },
        };
    }

    /**
     * Shared worker for POST and PUT /ocpi/credentials.
     * Processes incoming CPO credentials, keeps partner + credentials in sync,
     * and returns this EMSP's credentials object.
     */
    private static async processIncomingCredentials(
        incoming: OCPICredentials,
        authToken?: string,
    ): Promise<OCPICredentials> {
        const prisma = databaseService.prisma;

        // Basic validation: OCPI requires at least one role.
        if (!incoming.roles || incoming.roles.length === 0) {
            throw new Error('At least one role is required in credentials payload');
        }

        if (!authToken) {
            throw new Error('CPO auth token is required');
        }

        const partnerCredentials = await Utils.findPartnerCredentialsUsingCPOAuthToken(authToken);

        if (!partnerCredentials) {
            throw new Error('Partner credentials not found');
        }

        // 3) Update CPO credentials row for this partner – store CPO token/URL.
        await prisma.oCPIPartnerCredentials.update({
            where: { partner_id: partnerCredentials.partner_id },
            data: {
                cpo_auth_token: incoming.token,
                cpo_url: incoming.url,
            },
        });

        const emspPartner = await prisma.oCPIPartner.findFirst({
            where: {
                role: 'EMSP',
                deleted: false,
            },
        });

        return {
            token: partnerCredentials.emsp_auth_token || '',
            url: partnerCredentials.emsp_url || '',
            roles: [
                {
                    country_code: emspPartner?.country_code as CountryCode,
                    party_id: emspPartner?.party_id as string,
                    role: OCPIRole.EMSP,
                },
            ],
        };
    }
}