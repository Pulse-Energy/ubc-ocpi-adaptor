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
import OCPIPartnerDbService from '../../db-services/OCPIPartnerDbService';
import { OCPIPartnerEndpoint, Prisma } from '@prisma/client';
import { OCPIPartnerCredentialsDbService } from '../../db-services/OCPIPartnerCredentialsDbService';
import { AdminRegisterRequestPayload } from '../types/request';
import AdminVersionsModule from './AdminVersionsModule';
import { OCPIVersionClass } from '../../ocpi/schema/modules/verisons/types';
import { OCPIVersionDetailResponse } from '../../ocpi/schema/modules/verisons/types/responses';
import AdminTokensModule from './AdminTokensModule';
import { OCPIToken } from '../../ocpi/schema/modules/tokens/types';
import { OCPIPartnerEndpointDbService } from '../../db-services/OCPIPartnerEndpointDbService';
import { OCPIVersionNumber } from '../../ocpi/schema/modules/verisons/enums';

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
            partner.id,
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
            partner.id,
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
    public static async registerCpoFromCredentialsPayload(
        req: Request,
    ): Promise<HttpResponse<AdminResponsePayload<any>>> {
        const payload = req.body as AdminRegisterRequestPayload | undefined;

            if (!payload) {
                throw new ValidationError('OCPI credentials payload is required');
            }
    
            const { cpo_auth_token: cpoAuthToken, cpo_versions_url: cpoVersionsUrl, cpo_party_id: cpoPartyId, cpo_country_code: cpoCountryCode, cpo_name: cpoName, cpo_token: cpoToken, emsp_auth_token: emspAuthToken, emsp_ocpi_host: emspOcpiHost, emsp_party_id: emspPartyId = "EMSP", emsp_country_code: emspCountryCode = "IN", emsp_name: emspName = "EMSP PARTNER" } = payload;
    
            if (!cpoAuthToken) {
                throw new ValidationError('cpo_auth_token is required');
            }
            if (!cpoVersionsUrl) {
                throw new ValidationError('cpo_versions_url is required');
            }
            if (!cpoPartyId) {
                throw new ValidationError('cpo_party_id is required');
            }
            if (!cpoCountryCode) {
                throw new ValidationError('cpo_country_code is required');
            }
            if (!cpoName) {
                throw new ValidationError('cpo_name is required');
            }

            if (!cpoToken) {
                throw new ValidationError('cpo_token is required');
            }
    
            const prisma = databaseService.prisma;
    
            // 1) Upsert OCPIPartner (by country_code + party_id + role = CPO)
            let partner = await OCPIPartnerDbService.getFirstByFilter({
                where: {
                    country_code: cpoCountryCode,
                    party_id: cpoPartyId,
                    role: 'CPO',
                    deleted: false,
                },
            });
    
            if (partner) {
                const partnerUpdateFields: Prisma.OCPIPartnerUncheckedUpdateInput = {};
                if (cpoName) {
                    partnerUpdateFields.name = cpoName;
                }
    
                partner = await OCPIPartnerDbService.update(partner.id, partnerUpdateFields);
            }
            else {
                const partnerCreateFields: Prisma.OCPIPartnerCreateInput = {
                    name: cpoName,
                    country_code: cpoCountryCode,
                    party_id: cpoPartyId,
                    role: 'CPO',
                    versions_url: cpoVersionsUrl,
                    status: 'INIT',
                };
    
                partner = await OCPIPartnerDbService.create({ data: partnerCreateFields });
            }

            let emspPartner = await OCPIPartnerDbService.getFirstByFilter({
                where: {
                    role: 'EMSP',
                    deleted: false,
                },
            });
    
            if (!emspPartner) {
                if (!emspAuthToken) {
                    throw new ValidationError('emsp_auth_token is required for first time registration');
                }
                if (!emspName) {
                    throw new ValidationError('emsp_name is required for first time registration');
                }
                if (!emspPartyId) {
                    throw new ValidationError('emsp_party_id is required for first time registration');
                }
                if (!emspCountryCode) {
                    throw new ValidationError('emsp_country_code is required for first time registration');
                }
                if (!emspOcpiHost) {
                    throw new ValidationError('emsp_ocpi_host is required for first time registration');
                }

                
                const emspPartnerCreateFields: Prisma.OCPIPartnerCreateInput = {
                    name: emspName,
                    country_code: emspCountryCode,
                    party_id: emspPartyId,
                    role: 'EMSP',
                    versions_url: `${emspOcpiHost}/ocpi/versions`,
                    status: 'ACTIVE',
                };
                emspPartner = await OCPIPartnerDbService.create({ data: emspPartnerCreateFields });

                // create emsp version
                const emspVersionCreateFields: Prisma.OCPIVersionCreateInput = {
                    partner: { connect: { id: emspPartner?.id || '' } },
                    version_id: OCPIVersionNumber.v2_2_1,
                    version_url: `${emspOcpiHost}/ocpi/${OCPIVersionNumber.v2_2_1}/details`,
                };

                await databaseService.prisma.oCPIVersion.create({ data: emspVersionCreateFields });

                // Create EMSP endpoints
                const baseUrl = `${emspOcpiHost}/ocpi/${OCPIVersionNumber.v2_2_1}`;
                const emspEndpoints = [
                    { module: 'credentials', role: 'SENDER',   url: `${baseUrl}/credentials` },
                    { module: 'credentials', role: 'RECEIVER', url: `${baseUrl}/credentials` },
                
                    { module: 'locations', role: 'RECEIVER', url: `${baseUrl}/locations` },
                    { module: 'tariffs',   role: 'RECEIVER', url: `${baseUrl}/tariffs` },
                
                    { module: 'sessions', role: 'SENDER',   url: `${baseUrl}/sessions` },
                    { module: 'sessions', role: 'RECEIVER', url: `${baseUrl}/sessions` },
                
                    { module: 'cdrs', role: 'RECEIVER', url: `${baseUrl}/cdrs` },
                
                    { module: 'tokens', role: 'SENDER',   url: `${baseUrl}/tokens` },
                    { module: 'tokens', role: 'RECEIVER', url: `${baseUrl}/tokens` },
                
                    { module: 'commands', role: 'SENDER',   url: `${baseUrl}/commands` },
                    { module: 'commands', role: 'RECEIVER', url: `${baseUrl}/commands` },
                ];
                
                const ocpiEndpointsCreateFields: Prisma.OCPIPartnerEndpointCreateManyInput[] = emspEndpoints.map((endpoint) => ({
                    partner_id: emspPartner?.id || '',
                    module: endpoint.module,
                    role: endpoint.role,
                    url: endpoint.url,
                    version: OCPIVersionNumber.v2_2_1,
                }));
                await OCPIPartnerEndpointDbService.createMultipleEndpoints({ data: ocpiEndpointsCreateFields });
            }
    
            // 2) Upsert OCPIPartnerCredentials for this partner
            let credentials = await OCPIPartnerCredentialsDbService.getByPartnerId(partner.id);
    
            if (!credentials) {
                const credentialsCreateFields: Prisma.OCPIPartnerCredentialsCreateInput = {
                    partner: { connect: { id: partner.id } },
                    cpo_auth_token: cpoAuthToken,
                    cpo_url: cpoVersionsUrl,
                    emsp_auth_token: emspAuthToken ?? randomUUID(),
                    emsp_url: emspPartner.versions_url,
                };
                credentials = await OCPIPartnerCredentialsDbService.createCredentials({ data: credentialsCreateFields });
            }
        
    
            // Fetch versions from the CPO
            const cpoVersions = await AdminVersionsModule.getCpoVersions({
                body: {
                    partner_id: partner.id,
                },
            } as Request);
    
            if (!(cpoVersions.payload.data as unknown as { success: boolean })?.success) {
                throw new ValidationError('Failed to fetch versions from the CPO');
            }

            // Fetch version details from the CPO
            const cpoVersionDetails = await AdminVersionsModule.getCpoVersionDetails({
                body: {
                    partner_id: partner.id,
                },
            } as Request);

            if (!(cpoVersionDetails.payload.data as unknown as { success: boolean })?.success) {
                throw new ValidationError('Failed to fetch version details from the CPO');
            }

            // create credentials for the EMSP
            const emspCredentials: OCPICredentials & { partner_id: string } = {
                partner_id: partner.id,
                token: credentials.emsp_auth_token || '', 
                url: credentials.emsp_url || '',
                roles: [
                    {
                        country_code: emspPartner.country_code as CountryCode,
                        party_id: emspPartner.party_id as string,
                        role: emspPartner.role as OCPIRole,
                        business_details: {
                            name: emspName,
                        }
                    },
                ],
            };

            const errors: any[] = [];

            try {
                // Hit the admin credentials Post endpoint to create the credentials for the EMSP
                const emspCredentialsResponse = await AdminCredentialsModule.sendPostCredentials({
                    body: emspCredentials,
                } as Request);

                if (emspCredentialsResponse.httpStatus !== 200) {
                    throw new ValidationError('Failed to create credentials for the EMSP');
                }

                // update CPO partner to active status
                await OCPIPartnerDbService.update(partner.id, { status: 'ACTIVE' });
            }
            catch(error) {
                errors.push(error as string);
            }

            // create a token for the EMSP
            const cpoTokenResponse = await AdminTokensModule.upsertTokenAndSyncWithCPO({
                body: {
                    partner_id: partner.id,
                    ...cpoToken,
                },
            } as Request);

            if (cpoTokenResponse.httpStatus !== 200) {
                throw new ValidationError('Failed to create token for the EMSP');
            }

            return OCPIResponseService.success({
                data: {
                    cpo_partner: partner,
                    cpo_credentials: credentials,
                    cpo_version_details: cpoVersionDetails.payload.data as unknown as OCPIVersionDetailResponse,
                    cpo_versions: cpoVersions.payload.data as unknown as OCPIVersionClass[],
                    cpo_token: cpoTokenResponse.payload.data as unknown as OCPIToken,
                    emsp_partner: emspPartner,
                    emsp_credentials: emspCredentials,
                    emsp_version_details: cpoVersionDetails.payload.data as unknown as OCPIVersionDetailResponse,
                    emsp_versions: cpoVersions.payload.data as unknown as OCPIVersionClass[],
                },
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            } as AdminResponsePayload<any>);
    }
}
