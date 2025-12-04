import { Request } from 'express';
import process from 'process';
import { OCPIPartner, OCPIPartnerCredentials } from '@prisma/client';
import { HttpResponse } from '../../../types/responses';
import { OCPIResponseStatusCode, OCPIRole } from '../../schema/general/enum';
import CountryCode from '../../schema/general/enum/country-codes';
import { OCPIResponsePayload } from '../../schema/general/types/responses';
import { OCPICredentials } from '../../schema/modules/credentials/types';
import { databaseService } from '../../../services/database.service';
import { appConfig } from '../../../config/app.config';

/**
 * Handle all incoming requests for the Credentials module (OCPI 2.2.1)
 *
 * Grouped under `src/ocpi/handshake/credentials` so that all handshake-related
 * APIs are easy to discover.
 */
export default class OCPIv221CredentialsModuleIncomingRequestService {
    /**
     * POST /ocpi/credentials
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
        const prisma = databaseService.prisma;

        // Basic validation: OCPI requires at least one role.
        if (!incoming.roles || incoming.roles.length === 0) {
            return {
                httpStatus: 400,
                payload: {
                    status_code: OCPIResponseStatusCode.status_2000,
                    status_message: 'At least one role is required in credentials payload',
                    timestamp: new Date().toISOString(),
                },
            };
        }

        const cpoRole = incoming.roles[0];

        // Upsert OCPIPartner based on country_code + party_id
        let partner: OCPIPartner | null = await prisma.oCPIPartner.findFirst({
            where: {
                country_code: cpoRole.country_code,
                party_id: cpoRole.party_id,
            },
        });

        if (!partner) {
            partner = await prisma.oCPIPartner.create({
                data: {
                    name: cpoRole.business_details?.name,
                    country_code: cpoRole.country_code,
                    party_id: cpoRole.party_id,
                    versions_url: '', // can be populated when EMSP calls CPO /versions
                    status: 'ACTIVE',
                },
            });
        }
        else {
            partner = await prisma.oCPIPartner.update({
                where: { id: partner.id },
                data: {
                    name: cpoRole.business_details?.name || partner.name,
                    status: 'ACTIVE',
                },
            });
        }

        const emspCredentials = OCPIv221CredentialsModuleIncomingRequestService.buildEmspCredentials();

        // Upsert OCPICredentials row for this partner
        let existingCreds: OCPIPartnerCredentials | null = await prisma.oCPIPartnerCredentials.findUnique({
            where: { partner_id: partner.id },
        });

        if (!existingCreds) {
            await prisma.oCPIPartnerCredentials.create({
                data: {
                    partner_id: partner.id,
                    cpo_auth_token: incoming.token,
                    emsp_auth_token: emspCredentials.token,
                    cpo_url: incoming.url,
                    emsp_url: emspCredentials.url,
                },
            });
        }
        else {
            await prisma.oCPIPartnerCredentials.update({
                where: { partner_id: partner.id },
                data: {
                    cpo_auth_token: incoming.token,
                    emsp_auth_token: emspCredentials.token,
                    cpo_url: incoming.url,
                    emsp_url: emspCredentials.url,
                },
            });
        }

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
     * CPO calls this to confirm connectivity and retrieve the EMSP credentials
     * object. For now we generate it from configuration.
     */
    public static async handleGetCredentials(): Promise<HttpResponse<OCPIResponsePayload<OCPICredentials>>> {
        const credentials = OCPIv221CredentialsModuleIncomingRequestService.buildEmspCredentials();

        return {
            httpStatus: 200,
            payload: {
                data: credentials,
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            },
        };
    }

    /**
     * Build this EMSP's credentials object based on configuration.
     */
    private static buildEmspCredentials(): OCPICredentials {
        const token = process.env.OCPI_EMSP_TOKEN || 'local-emsp-token';
        const host = process.env.OCPI_HOST || 'http://localhost:6001';

        return {
            token,
            url: `${host}/ocpi/credentials`,
            roles: [
                {
                    role: OCPIRole.EMSP,
                    business_details: {
                        name: process.env.OCPI_BUSINESS_NAME || 'UBC EMSP',
                    },
                    party_id: appConfig.ocpi.partyId || 'EMP',
                    country_code: (appConfig.ocpi.countryCode || 'IN') as CountryCode,
                },
            ],
        };
    }
}



