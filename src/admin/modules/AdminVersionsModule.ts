import { Request } from 'express';
import { HttpResponse } from '../../types/responses';
import { AdminResponsePayload } from '../types/responses';
import { ValidationError } from '../../utils/errors';
import {
    OCPIVersionClass,
} from '../../ocpi/schema/modules/verisons/types';
import {
    OCPIv211VersionDetailResponse,
    OCPIVersionDetailResponse,
} from '../../ocpi/schema/modules/verisons/types/responses';
import { databaseService } from '../../services/database.service';
import OCPIv221VersionsModuleOutgoingRequestService from '../../ocpi/modules/v2.2.1/emsp/versions/OCPIv221VersionsModuleOutgoingRequestService';
import { OCPIVersionNumber } from '../../ocpi/schema/modules/verisons/enums';

type VersionDetailUnion = OCPIVersionDetailResponse | OCPIv211VersionDetailResponse;

export default class AdminVersionsModule {
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

        const versions: OCPIVersionClass[] =
            await OCPIv221VersionsModuleOutgoingRequestService.getVersions(
                partner.versions_url,
                creds.cpo_auth_token,
                partner.id,
            );

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
        const { partner_id: partnerId } = req.body as {
            partner_id?: string;
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

        const v221Version = versions.find((v) => v.version_id === OCPIVersionNumber.v2_2_1);
        const v211Version = versions.find((v) => v.version_id === OCPIVersionNumber.v2_1_1);

        const selected = v221Version ?? v211Version;
        if (!selected) {
            throw new ValidationError('No valid version found for this partner');
        }

        const versionDetails: VersionDetailUnion =
            await OCPIv221VersionsModuleOutgoingRequestService.getVersionDetails(
                selected.version_url,
                creds.cpo_auth_token,
                selected.version_id,
                partner.id,
            );

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
}


