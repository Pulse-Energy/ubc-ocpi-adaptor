import OCPIOutgoingRequestService from '../../../../services/OCPIOutgoingRequestService';
import {
    OCPIVersionClass,
} from '../../../../schema/modules/verisons/types';
import {
    OCPIv211VersionDetailResponse,
    OCPIVersionDetailResponse,
} from '../../../../schema/modules/verisons/types/responses';
import { OCPILogCommand } from '../../../../types';

type VersionDetailUnion = OCPIVersionDetailResponse | OCPIv211VersionDetailResponse;

/**
 * OCPI 2.2.1 – Versions module (outgoing, EMSP → CPO).
 *
 * This service is responsible only for talking to the CPO versions endpoints.
 * It does not touch the database or admin-specific logic.
 */
export default class OCPIv221VersionsModuleOutgoingRequestService {
    /**
     * Call the CPO /versions endpoint for a given partner.
     *
     * @param versionsUrl Full URL of the CPO /versions endpoint (from OCPIPartner.versions_url)
     * @param cpoAuthToken Token the CPO expects from this EMSP
     */
    public static async getVersions(
        versionsUrl: string,
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<OCPIVersionClass[]> {
        if (!cpoAuthToken) {
            throw new Error('CPO auth token is required');
        }

        const response = await OCPIOutgoingRequestService.sendGetRequest({
            url: versionsUrl,
            headers: {
                Authorization: `Token ${cpoAuthToken}`,
            },
            partnerId,
            command: OCPILogCommand.SendGetVersionReq,
        });

        const payload = response.data as {
            data?: OCPIVersionClass[];
            versions?: OCPIVersionClass[];
            status_code?: number;
        };

        const versions: OCPIVersionClass[] | undefined =
            payload.data ?? payload.versions;

        if (!versions || !Array.isArray(versions)) {
            throw new Error('Invalid response format from CPO /versions endpoint');
        }

        return versions;
    }

    /**
     * Call the CPO version-details endpoint for a specific version.
     *
     * @param versionUrl Full URL of the CPO version-details endpoint (from OCPIVersion.version_url)
     * @param cpoAuthToken Token the CPO expects from this EMSP
     * @param fallbackVersionId Optional version_id to use if CPO responds with only endpoints
     */
    public static async getVersionDetails(
        versionUrl: string,
        cpoAuthToken: string,
        fallbackVersionId?: string,
        partnerId?: string,
    ): Promise<VersionDetailUnion> {
        if (!cpoAuthToken) {
            throw new Error('CPO auth token is required');
        }

        const response = await OCPIOutgoingRequestService.sendGetRequest({
            url: versionUrl,
            headers: {
                Authorization: `Token ${cpoAuthToken}`,
            },
            partnerId,
            command: OCPILogCommand.SendGetVersionDetailsReq,
        });

        const payload = response.data as {
            data?: VersionDetailUnion;
            endpoints?: VersionDetailUnion['endpoints'];
        };

        if (payload.data) {
            return payload.data;
        }

        const endpoints = payload.endpoints ?? [];

        return {
            version: (fallbackVersionId ?? '') as any,
            endpoints,
        };
    }
}


