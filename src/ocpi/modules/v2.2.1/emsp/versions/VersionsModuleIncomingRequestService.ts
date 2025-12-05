import { Request } from 'express';
import { HttpResponse } from '../../../../../types/responses';
import { AppError } from '../../../../../utils/errors';
import { OCPIResponseStatusCode } from '../../../../schema/general/enum';
import { OCPIResponsePayload } from '../../../../schema/general/types/responses';
import { OCPIInterfaceRole, OCPIModuleID, OCPIVersionNumber } from '../../../../schema/modules/verisons/enums';
import { OCPIEndpointClass, OCPIv211EndpointClass, OCPIVersionClass } from '../../../../schema/modules/verisons/types';
import { OCPIv211VersionDetailResponse, OCPIVersionDetailResponse } from '../../../../schema/modules/verisons/types/responses';

/**
 * OCPI Versions module (incoming, EMSP side, v2.2.1).
 *
 * File name and path follow the existing convention:
 *   src/ocpi/modules/v2.2.1/emsp/versions/VersionsModuleIncomingRequestService.ts
 */
export default class VersionsModuleIncomingRequestService {

    public static async handleGetVersions(): Promise<HttpResponse<OCPIResponsePayload<OCPIVersionClass[]>>> {
        const baseHost = process.env.OCPI_HOST || 'http://localhost:6001';

        const versions: OCPIVersionClass[] = [
            {
                version: OCPIVersionNumber.v2_2_1,
                url: `${baseHost}/ocpi/versions/${OCPIVersionNumber.v2_2_1}/details`,
            },
        ];

        return {
            httpStatus: 200,
            payload: {
                data: versions,
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            },
        };
    }

    public static async handleGetVersionDetails(
        req: Request,
    ): Promise<HttpResponse<OCPIResponsePayload<OCPIVersionDetailResponse | OCPIv211VersionDetailResponse>>> {
        const version = req.params.ocpi_version as OCPIVersionNumber;

        let versionDetails: OCPIVersionDetailResponse | OCPIv211VersionDetailResponse;

        if (version === OCPIVersionNumber.v2_2_1) {
            versionDetails = VersionsModuleIncomingRequestService.handleGetVersionDetailsV221();
        }
        else {
            throw new AppError('Invalid version', 400);
        }

        return {
            httpStatus: 200,
            payload: {
                data: versionDetails,
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            },
        };
    }

    private static handleGetVersionDetailsV221(): OCPIVersionDetailResponse {
        const baseUrl = `${process.env.OCPI_HOST || 'http://localhost:6001'}/ocpi/${OCPIVersionNumber.v2_2_1}`;

        const endpoints: OCPIEndpointClass[] = [
            {
                identifier: OCPIModuleID.CredentialsAndRegistration,
                url: `${baseUrl}/${OCPIModuleID.CredentialsAndRegistration}`,
                role: OCPIInterfaceRole.Sender,
            },
            {
                identifier: OCPIModuleID.CredentialsAndRegistration,
                url: `${baseUrl}/${OCPIModuleID.CredentialsAndRegistration}`,
                role: OCPIInterfaceRole.Receiver,
            },
            {
                identifier: OCPIModuleID.Locations,
                url: `${baseUrl}/${OCPIModuleID.Locations}`,
                role: OCPIInterfaceRole.Receiver,
            },
            {
                identifier: OCPIModuleID.Tariffs,
                url: `${baseUrl}/${OCPIModuleID.Tariffs}`,
                role: OCPIInterfaceRole.Receiver,
            },
            // {
            //     identifier: OCPIModuleID.Sessions,
            //     url: `${baseUrl}/${OCPIModuleID.Sessions}`,
            //     role: OCPIInterfaceRole.Receiver,
            // },
            // {
            //     identifier: OCPIModuleID.Commands,
            //     url: `${baseUrl}/${OCPIModuleID.Commands}`,
            //     role: OCPIInterfaceRole.Sender,
            // },
            {
                identifier: OCPIModuleID.Tokens,
                url: `${baseUrl}/${OCPIModuleID.Tokens}`,
                role: OCPIInterfaceRole.Sender,
            },
        ];

        return {
            version: OCPIVersionNumber.v2_2_1,
            endpoints,
        };
    }

    private static handleGetVersionDetailsV211(): OCPIv211VersionDetailResponse {
        const baseUrl = `${process.env.OCPI_HOST || 'http://localhost:6001'}/ocpi/${OCPIVersionNumber.v2_1_1}`;

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