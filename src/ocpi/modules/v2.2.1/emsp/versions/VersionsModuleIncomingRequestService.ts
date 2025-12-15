import { Request, Response } from 'express';
import { HttpResponse } from '../../../../../types/responses';
import { AppError } from '../../../../../utils/errors';
import { OCPIResponseStatusCode } from '../../../../schema/general/enum';
import { OCPIResponsePayload } from '../../../../schema/general/types/responses';
import { OCPIInterfaceRole, OCPIModuleID, OCPIVersionNumber } from '../../../../schema/modules/verisons/enums';
import { OCPIEndpointClass, OCPIv211EndpointClass, OCPIVersionClass } from '../../../../schema/modules/verisons/types';
import { OCPIv211VersionDetailResponse, OCPIVersionDetailResponse } from '../../../../schema/modules/verisons/types/responses';
import Utils from '../../../../../utils/Utils';
import { databaseService } from '../../../../../services/database.service';
import { OCPIRequestLogService } from '../../../../services/OCPIRequestLogService';
import { OCPILogCommand } from '../../../../types';
import { OCPIPartnerCredentials } from '@prisma/client';

/**
 * OCPI Versions module (incoming, EMSP side, v2.2.1).
 *
 * File name and path follow the existing convention:
 *   src/ocpi/modules/v2.2.1/emsp/versions/VersionsModuleIncomingRequestService.ts
 */
export default class VersionsModuleIncomingRequestService {

    public static async handleGetVersions(
        req: Request,
        res: Response,
        partnerCredentials?: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<OCPIVersionClass[]>>> {
        // Log incoming request (non-blocking)
        OCPIRequestLogService.logRequest({
            req,
            partnerId: partnerCredentials?.partner_id,
            command: OCPILogCommand.GetVersionReq,
        });

        const emspPartner = await Utils.findEmspPartner();

        if (!emspPartner) {
            const response = {
                httpStatus: 404,
                payload: {
                    status_code: OCPIResponseStatusCode.status_2001,
                    status_message: 'EMSP partner not found',
                    timestamp: new Date().toISOString(),
                },
            };

            // Log outgoing response (non-blocking)
            OCPIRequestLogService.logResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus,
                partnerId: partnerCredentials?.partner_id,
                command: OCPILogCommand.GetVersionRes,
            });

            return response;
        }

        const ocpiVersions = await databaseService.prisma.oCPIVersion.findMany({
            where: {
                partner_id: emspPartner.id,
                deleted: false,
            },
            orderBy: {
                created_at: 'desc',
            },
        });

        const versions: OCPIVersionClass[] = ocpiVersions.map((v) => ({
            version: v.version_id as OCPIVersionNumber,
            url: v.version_url,
        }));

        const response = {
            httpStatus: 200,
            payload: {
                data: versions,
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            },
        };

        // Log outgoing response
        await OCPIRequestLogService.logResponse({
            req,
            res,
            responseBody: response.payload,
            statusCode: response.httpStatus,
            partnerId: partnerCredentials?.partner_id,
            command: OCPILogCommand.GetVersionRes,
        });

        return response;
    }

    public static async handleGetVersionDetails(
        req: Request,
        res: Response,
        partnerCredentials?: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPIResponsePayload<OCPIVersionDetailResponse | OCPIv211VersionDetailResponse>>> {
        // Log incoming request (non-blocking)
        OCPIRequestLogService.logRequest({
            req,
            partnerId: partnerCredentials?.partner_id,
            command: OCPILogCommand.GetVersionDetailsReq,
        });

        // For this EMSP implementation we currently only support 2.2.1 and the
        // interface is mounted at /ocpi/emsp/2.2.1, so this handler always
        // returns the 2.2.1 version details.
        
        const versionDetails = await VersionsModuleIncomingRequestService.handleGetVersionDetailsV221();
        const response = {
            httpStatus: 200,
            payload: {
                data: versionDetails,
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            },
        };

        // Log outgoing response
        await OCPIRequestLogService.logResponse({
            req,
            res,
            responseBody: response.payload,
            statusCode: response.httpStatus,
            partnerId: partnerCredentials?.partner_id,
            command: OCPILogCommand.GetVersionDetailsRes,
        });

        return response;
    }

    private static async handleGetVersionDetailsV221(): Promise<OCPIVersionDetailResponse> {
        const emspPartner = await Utils.findEmspPartner();

        if (!emspPartner) {
            throw new AppError('EMSP partner not found', 404);
        }

        const ocpiPartnerEndpoints = await databaseService.prisma.oCPIPartnerEndpoint.findMany({
            where: {
                partner_id: emspPartner.id,
                version: OCPIVersionNumber.v2_2_1,
                deleted: false,
            },
        });

        const endpoints: OCPIEndpointClass[] = ocpiPartnerEndpoints.map((e) => ({
            identifier: e.module as OCPIModuleID,
            role: e.role as OCPIInterfaceRole,
            url: e.url,
        }));

        return {
            version: OCPIVersionNumber.v2_2_1,
            endpoints,
        };
    }

    private static handleGetVersionDetailsV211(): OCPIv211VersionDetailResponse {
        const baseUrl = `${process.env.OCPI_HOST || 'https://nearly-boss-pheasant.ngrok-free.app'}/ocpi/${OCPIVersionNumber.v2_1_1}`;

        const endpoints: OCPIv211EndpointClass[] = [
            {
                identifier: OCPIModuleID.CredentialsAndRegistration,
                url: `${baseUrl}/${OCPIModuleID.CredentialsAndRegistration}`,
            },
            {
                identifier: OCPIModuleID.CredentialsAndRegistration,
                url: `${baseUrl}/${OCPIModuleID.CredentialsAndRegistration}`,
            },
            {
                identifier: OCPIModuleID.Locations,
                url: `${baseUrl}/${OCPIModuleID.Locations}`,
            },
            {
                identifier: OCPIModuleID.Tariffs,
                url: `${baseUrl}/${OCPIModuleID.Tariffs}`,
            },
            {
                identifier: OCPIModuleID.Sessions,
                url: `${baseUrl}/${OCPIModuleID.Sessions}`,
            },
            {
                identifier: OCPIModuleID.Commands,
                url: `${baseUrl}/${OCPIModuleID.Commands}`,
            },
            {
                identifier: OCPIModuleID.Tokens,
                url: `${baseUrl}/${OCPIModuleID.Tokens}`,
            },
        ];

        return {
            version: OCPIVersionNumber.v2_1_1,
            endpoints,
        };
    }
}