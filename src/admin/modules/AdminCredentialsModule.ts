import { Request } from 'express';
import { HttpResponse } from '../../types/responses';
import { AdminResponsePayload } from '../types/responses';
import { ValidationError } from '../../utils/errors';
import { OCPICredentials, OCPICredentialsRoleClass } from '../../ocpi/schema/modules/credentials/types';
import { databaseService } from '../../services/database.service';
import { OCPIResponsePayload } from '../../ocpi/schema/general/types/responses';
import OCPIv221CredentialsModuleOutgoingRequestService from '../../ocpi/modules/v2.2.1/credentials/OCPIv221CredentialsModuleOutgoingRequestService';

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
}


