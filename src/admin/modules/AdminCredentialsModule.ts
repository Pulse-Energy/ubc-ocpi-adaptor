import { Request } from 'express';
import { randomUUID } from 'crypto';
import { HttpResponse } from '../../types/responses';
import { AdminResponsePayload } from '../types/responses';
import { ValidationError } from '../../utils/errors';
import { OCPICredentials, OCPICredentialsRoleClass } from '../../ocpi/schema/modules/credentials/types';
import { databaseService } from '../../services/database.service';
import { OCPIResponsePayload } from '../../ocpi/schema/general/types/responses';
import { OCPIResponseStatusCode, OCPIRole } from '../../ocpi/schema/general/enum';
import CountryCode from '../../ocpi/schema/general/enum/country-codes';
import OCPIv221CredentialsModuleOutgoingRequestService from '../../ocpi/modules/v2.2.1/credentials/OCPIv221CredentialsModuleOutgoingRequestService';
import OCPIResponseService from '../../ocpi/services/OCPIResponseService';

export default class AdminCredentialsModule {
    /**
     * POST /api/admin/ocpi/credentials/send
     *
     * Directly POST a raw OCPI Credentials object to a CPO.
     * Request body MUST be the OCPI credentials payload:
     * {
     *   token: string;
     *   url: string;
     *   roles: [{ country_code, party_id, role }]
     *   partner_id: string;
     * }
     */
    public static async sendPostCredentials(
        req: Request,
    ): Promise<HttpResponse<AdminResponsePayload<OCPIResponsePayload<OCPICredentials>>>> {
        const {
            token,
            url,
            roles,
            partner_id,
        } = req.body as {
            token: string;
            url: string;
            roles: OCPICredentialsRoleClass[];
            partner_id: string;
        };

        const partner = await databaseService.prisma.oCPIPartner.findUnique({
            where: { id: partner_id },
            include: { credentials: true },
        });
        if (!partner) {
            throw new ValidationError('OCPI partner not found');
        }

        const credentials = partner.credentials;
        if (!credentials || !credentials.cpo_auth_token) {
            throw new ValidationError('OCPI partner credentials (cpo_auth_token) not configured');
        }

        // fetch from ocpi partner endpoints table
        const cpoCredentialsUrl = await databaseService.prisma.oCPIPartnerEndpoint.findFirst({
            where: { partner_id: partner.id, module: 'credentials', role: 'SENDER' },
            select: { url: true },
        });

        if (!cpoCredentialsUrl) {
            throw new ValidationError('OCPI partner credentials URL not found');
        }

        const response = await OCPIv221CredentialsModuleOutgoingRequestService.sendPostCredentials(
            credentials.cpo_auth_token,
            cpoCredentialsUrl?.url || '',
            token,
            url,
            roles,
        );

        await databaseService.prisma.oCPIPartnerCredentials.update({
            where: { partner_id: partner.id },
            data: { cpo_auth_token: response.payload.data?.token },
        });

        return {
            httpStatus: response.httpStatus,
            payload: {
                data: response.payload,
            },
        };
    }

    /**
     * GET /api/admin/ocpi/credentials
     *
     * Calls the CPO GET /credentials endpoint for a given partner and returns
     * the raw OCPI credentials response.
     *
     * Query: ?partner_id=<OCPIPartner.id>
     */
    public static async getCpoCredentials(
        req: Request,
    ): Promise<HttpResponse<AdminResponsePayload<OCPIResponsePayload<OCPICredentials>>>> {
        const { partner_id: partnerId } = req.query as { partner_id?: string };

        if (!partnerId) {
            throw new ValidationError('partner_id is required');
        }

        const prisma = databaseService.prisma;

        const partner = await prisma.oCPIPartner.findUnique({
            where: { id: partnerId },
            include: { credentials: true, endpoints: true },
        });

        if (!partner || partner.deleted) {
            throw new ValidationError('OCPI partner not found');
        }

        const creds = partner.credentials;
        if (!creds || !creds.cpo_auth_token) {
            throw new ValidationError('OCPI partner credentials (cpo_auth_token) not configured');
        }

        const endpoint = partner.endpoints.find(
            (e) => !e.deleted && e.module === 'credentials' && e.role === 'SENDER',
        );
        if (!endpoint) {
            throw new ValidationError('OCPI partner credentials endpoint (module=credentials, role=SENDER) not found');
        }

        const response = await OCPIv221CredentialsModuleOutgoingRequestService.sendGetCredentials(
            endpoint.url,
            creds.cpo_auth_token,
        );

        return {
            httpStatus: response.httpStatus,
            payload: {
                data: response.payload,
            },
        };
    }

    /**
     * Upsert an OCPI CPO partner + credentials from a raw OCPI Credentials payload.
     *
     * Intended for admin/bootstrap flows where you manually paste the CPO's
     * credentials JSON (token, roles, url) and want to persist/update the
     * corresponding `OCPIPartner` and `OCPIPartnerCredentials` records.
     *
     * Body:
     * {
     *   token: string;
     *   url: string;
     *   roles: [{ country_code, party_id, role, business_details? }]
     * }
     */
    public static async upsertCpoFromCredentialsPayload(
        req: Request,
    ): Promise<HttpResponse<OCPIResponsePayload<OCPICredentials>>> {
        const payload = req.body as OCPICredentials | undefined;

        if (!payload) {
            throw new ValidationError('OCPI credentials payload is required');
        }

        const { token, url, roles } = payload;

        if (!token || !url) {
            throw new ValidationError('Both token and url are required in OCPI credentials payload');
        }

        if (!roles || roles.length === 0) {
            throw new ValidationError('At least one role is required in OCPI credentials payload');
        }

        const cpoRole = roles.find((r) => r.role === 'CPO');
        if (!cpoRole) {
            throw new ValidationError('CPO role is required in OCPI credentials payload');
        }

        const prisma = databaseService.prisma;

        // 1) Upsert OCPIPartner (by country_code + party_id + role = CPO)
        let partner = await prisma.oCPIPartner.findFirst({
            where: {
                country_code: cpoRole.country_code,
                party_id: cpoRole.party_id,
                role: 'CPO',
                deleted: false,
            },
        });

        const partnerData = {
            name: partner?.name ?? null,
            country_code: cpoRole.country_code,
            party_id: cpoRole.party_id,
            role: 'CPO',
            versions_url: url,
            status: partner?.status ?? 'INIT',
        };

        if (partner) {
            partner = await prisma.oCPIPartner.update({
                where: { id: partner.id },
                data: {
                    name: partnerData.name ?? undefined,
                    versions_url: partnerData.versions_url,
                    status: partnerData.status,
                },
            });
        }
        else {
            partner = await prisma.oCPIPartner.create({
                data: partnerData,
            });
        }

        // 2) Upsert OCPIPartnerCredentials for this partner
        let credentials = await prisma.oCPIPartnerCredentials.findUnique({
            where: { partner_id: partner.id },
        });

        if (credentials) {
            credentials = await prisma.oCPIPartnerCredentials.update({
                where: { partner_id: partner.id },
                data: {
                    cpo_auth_token: token,
                    cpo_url: url,
                    emsp_auth_token: credentials.emsp_auth_token ?? randomUUID(),
                },
            });
        }
        else {
            credentials = await prisma.oCPIPartnerCredentials.create({
                data: {
                    partner_id: partner.id,
                    cpo_auth_token: token,
                    cpo_url: url,
                    emsp_auth_token: randomUUID(),
                },
            });
        }

        // Build EMSP-facing OCPI credentials response (what we will expose to the CPO)
        const emspPartner = await prisma.oCPIPartner.findFirst({
            where: {
                role: 'EMSP',
                deleted: false,
            },
        });

        const emspCredentials: OCPICredentials & { partner_id: string } = {
            partner_id: partner.id,
            token: credentials.emsp_auth_token || '', 
            url: credentials.emsp_url || '',
            roles: [
                {
                    country_code: emspPartner?.country_code as CountryCode,
                    party_id: emspPartner?.party_id as string,
                    role: OCPIRole.EMSP,
                    business_details: {
                        name: emspPartner?.name ?? '',
                    },
                },
            ],
        };

        return OCPIResponseService.success(emspCredentials);
    }
}


