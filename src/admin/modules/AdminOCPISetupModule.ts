import { Request } from 'express';
import { HttpResponse } from '../../types/responses';
import { AdminResponsePayload } from '../types/responses';
import { ValidationError } from '../../utils/errors';
import OCPIOutgoingRequestService from '../../ocpi/services/OCPIOutgoingRequestService';
import {
    OCPIVersionClass,
} from '../../ocpi/schema/modules/verisons/types';
import {
    OCPIv211VersionDetailResponse,
    OCPIVersionDetailResponse,
} from '../../ocpi/schema/modules/verisons/types/responses';
import { OCPICredentials, OCPICredentialsRoleClass } from '../../ocpi/schema/modules/credentials/types';
import { databaseService } from '../../services/database.service';
import { OCPIResponsePayload } from '../../ocpi/schema/general/types/responses';
import OCPIv221CredentialsModuleOutgoingRequestService from '../../ocpi/modules/v2.2.1/credentials/OCPIv221CredentialsModuleOutgoingRequestService';

type VersionDetailUnion = OCPIVersionDetailResponse | OCPIv211VersionDetailResponse;

export default class AdminOCPISetupModule {
    /**
     * POST /api/admin/ocpi/versions
     *
     * Calls the CPO /versions endpoint for a given partner and stores any new
     * versions in the OCPIVersion table.
     *
     * Body: { partner_id }
     * - versions_url is read from OCPIPartner.versions_url
     * - cpo_token is read from OCPIPartnerCredentials.cpo_auth_token
     */
    public static async getCpoVersions(
        req: Request,
    ): Promise<HttpResponse<AdminResponsePayload<unknown>>> {
        const { partner_id: partnerId } = req.body as { partner_id?: string };
        if (!partnerId) {
            throw new ValidationError('partner_id is required');
        }

        const prisma = databaseService.prisma;

        const partner = await prisma.oCPIPartner.findUnique({
            where: { id: partnerId },
            include: { credentials: true },
        });

        if (!partner || partner.deleted) {
            throw new ValidationError('OCPI partner not found');
        }

        if (!partner.versions_url) {
            throw new ValidationError('OCPI partner is missing versions_url');
        }

        const creds = partner.credentials;
        if (!creds || !creds.cpo_auth_token) {
            throw new ValidationError('OCPI partner credentials (cpo_auth_token) not configured');
        }

        const versionsResponse = await OCPIOutgoingRequestService.sendGetRequest({
            url: partner.versions_url,
            headers: {
                Authorization: `Token ${creds.cpo_auth_token}`,
            },
        });

        const versionsPayload = versionsResponse.data as {
            data?: OCPIVersionClass[];
            versions?: OCPIVersionClass[];
            status_code?: number;
        };

        const versions: OCPIVersionClass[] = versionsPayload.data ?? versionsPayload.versions ?? [];

        // Create versions only if they do not already exist
        for (const v of versions) {
            const existing = await prisma.oCPIVersion.findFirst({
                where: {
                    partner_id: partner.id,
                    version_id: v.version,
                    deleted: false,
                },
            });
            if (!existing) {
                await prisma.oCPIVersion.create({
                    data: {
                        partner_id: partner.id,
                        version_id: v.version,
                        version_url: v.url,
                    },
                });
            }
        }

        return {
            payload: {
                data: {
                    success: true,
                    versions,
                },
            },
        };
    }

    /**
     * POST /api/admin/ocpi/version-details
     *
     * Calls the CPO version-details endpoint for a given partner + version and
     * stores any new endpoints in the OCPIPartnerEndpoint table.
     *
     * Body: { partner_id, version_id? }
     * - If version_id is omitted, prefers 2.2.1, otherwise first version in OCPIVersion.
     */
    public static async getCpoVersionDetails(
        req: Request,
    ): Promise<HttpResponse<AdminResponsePayload<unknown>>> {
        const { partner_id: partnerId, version_id: explicitVersionId } = req.body as {
            partner_id?: string;
            version_id?: string;
        };

        if (!partnerId) {
            throw new ValidationError('partner_id is required');
        }

        const prisma = databaseService.prisma;

        const partner = await prisma.oCPIPartner.findUnique({
            where: { id: partnerId },
            include: { credentials: true, versions: true },
        });

        if (!partner || partner.deleted) {
            throw new ValidationError('OCPI partner not found');
        }

        const creds = partner.credentials;
        if (!creds || !creds.cpo_auth_token) {
            throw new ValidationError('OCPI partner credentials (cpo_auth_token) not configured');
        }

        const versions = partner.versions.filter((v) => !v.deleted);
        if (versions.length === 0) {
            throw new ValidationError('No stored versions for this partner, call /versions first');
        }

        const preferredVersionId = explicitVersionId || '2.2.1';
        const selected =
            versions.find((v) => v.version_id === preferredVersionId) ?? versions[0];

        const versionDetailsResponse = await OCPIOutgoingRequestService.sendGetRequest({
            url: selected.version_url,
            headers: {
                Authorization: `Token ${creds.cpo_auth_token}`,
            },
        });

        const versionDetailsPayload = versionDetailsResponse.data as {
            data?: VersionDetailUnion;
            endpoints?: VersionDetailUnion['endpoints'];
        };

        const versionDetails: VersionDetailUnion =
            versionDetailsPayload.data ??
            {
                version: selected.version_id as any,
                endpoints: versionDetailsPayload.endpoints ?? [],
            };

        const endpoints = versionDetails.endpoints ?? [];

        // Create endpoints only if they do not already exist
        for (const endpoint of endpoints) {
            const existing = await prisma.oCPIPartnerEndpoint.findFirst({
                where: {
                    partner_id: partner.id,
                    version: versionDetails.version,
                    module: String(endpoint.identifier),
                    role: 'role' in endpoint && (endpoint as any).role ? String((endpoint as any).role) : '',
                    deleted: false,
                },
            });

            if (!existing) {
                await prisma.oCPIPartnerEndpoint.create({
                    data: {
                        partner_id: partner.id,
                        version: versionDetails.version,
                        module: String(endpoint.identifier),
                        role: 'role' in endpoint && (endpoint as any).role ? String((endpoint as any).role) : '',
                        url: endpoint.url,
                    },
                });
            }
        }

        return {
            payload: {
                data: {
                    success: true,
                    version_details: versionDetails,
                    endpoints_count: endpoints.length,
                },
            },
        };
    }

    /**
     * POST /api/admin/ocpi/credentials/send
     *
     * Directly POST a raw OCPI Credentials object to a CPO.
     * Request body MUST be the OCPI credentials payload:
     * {
     *   token: string;
     *   url: string;
     *   roles: [{ country_code, party_id, role }]
     *   cpoAuthToken: string;
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

        const ocpiRole = await databaseService.prisma.oCPIPartnerRole.findFirst({
            where: { partner_id: partner.id, role: 'EMSP' },
        });

        if (!ocpiRole) {
            await databaseService.prisma.oCPIPartnerRole.create({
                data: { partner_id: partner.id, role: 'EMSP', country_code: roles[0].country_code, party_id: roles[0].party_id },
            });
        }
        else {
            await databaseService.prisma.oCPIPartnerRole.update({
                where: { id: ocpiRole.id },
                data: { country_code: roles[0].country_code, party_id: roles[0].party_id },
            });
        }

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
     * GET /api/admin/ocpi/status
     *
     * Returns registration status and basic info for a given partner.
     * Expects query param: cpoId = OCPIPartner.id
     */
    public static async getRegistrationStatus(
        req: Request,
    ): Promise<HttpResponse<AdminResponsePayload<unknown>>> {
        const { cpoId } = req.query;

        if (!cpoId || typeof cpoId !== 'string') {
            throw new ValidationError('CPO ID is required');
        }

        const prisma = databaseService.prisma;

        const partner = await prisma.oCPIPartner.findUnique({
            where: { id: cpoId },
            include: {
                credentials: true,
                endpoints: true,
            },
        });

        if (!partner) {
            return {
                httpStatus: 404,
                payload: {
                    data: {
                        success: false,
                        message: 'CPO not found',
                    },
                },
            };
        }

        return {
            payload: {
                data: {
                    success: true,
                    status: partner.status,
                    partner: {
                        id: partner.id,
                        country_code: partner.country_code,
                        party_id: partner.party_id,
                        name: partner.name,
                    },
                    credentials: partner.credentials
                        ? {
                            cpo_url: partner.credentials.cpo_url,
                            emsp_url: partner.credentials.emsp_url,
                        }
                        : null,
                    endpoints_count: partner.endpoints.length,
                },
            },
        };
    }
}

