import { HttpResponse } from '../../../../types/responses';
import { OCPIResponsePayload } from '../../../schema/general/types/responses';
import {
    OCPICredentials,
    OCPICredentialsRoleClass,
} from '../../../schema/modules/credentials/types';
import OCPIOutgoingRequestService from '../../../services/OCPIOutgoingRequestService';
import { OCPILogCommand } from '../../../types';

/**
 * OCPI 2.2.1 Credentials module (outgoing, EMSP side).
 *
 * Used when THIS EMSP needs to talk to a CPO's /credentials endpoint:
 *  - POST /credentials  (initial handshake or updates)
 *  - GET /credentials   (fetch current CPO view of credentials)
 *  - PATCH /credentials (update token / URL)
 */
export default class OCPIv221CredentialsModuleOutgoingRequestService {
    /**
     * POST /credentials to CPO.
     *
     * Takes token, url and roles directly and calls the CPO /credentials endpoint.
     * The OCPI payload on the wire is:
     * {
     *   token: string;
     *   url: string;
     *   roles: [{ country_code, party_id, role }]
     * }
     */
    public static async sendPostCredentials(
        cpoAuthToken: string,
        cpoUrl: string,
        token: string,
        url: string,
        roles: OCPICredentialsRoleClass[],
        partnerId?: string,
    ): Promise<HttpResponse<OCPIResponsePayload<OCPICredentials>>> {
        const credentials: OCPICredentials = {
            token,
            url,
            roles,
        };

        const response = await OCPIOutgoingRequestService.sendPostRequest({
            url: cpoUrl,
            headers: {
                Authorization: `Token ${cpoAuthToken}`,
            },
            data: credentials,
            partnerId,
            command: OCPILogCommand.SendPostCredentialsReq,
        });

        const payload = response as OCPIResponsePayload<OCPICredentials>;

        return {
            httpStatus: 200,
            payload,
        };
    }

    /**
     * GET /credentials from CPO.
     *
     * @param cpoUrl Full URL of the CPO /credentials endpoint
     * @param cpoAuthToken Token that should be used to call the CPO (typically the CPO-issued token)
     */
    public static async sendGetCredentials(
        cpoUrl: string,
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<HttpResponse<OCPIResponsePayload<OCPICredentials>>> {
        const response = await OCPIOutgoingRequestService.sendGetRequest({
            url: cpoUrl,
            headers: {
                Authorization: `Token ${cpoAuthToken}`,
            },
            partnerId,
            command: OCPILogCommand.SendGetCredentialsReq,
        });

        const payload = response.data as OCPIResponsePayload<OCPICredentials>;

        return {
            httpStatus: 200,
            payload,
        };
    }


}
