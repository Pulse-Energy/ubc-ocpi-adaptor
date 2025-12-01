import { Request } from "express";
import { HttpResponse } from "../../../../types/responses";
import { OCPIResponseStatusCode, OCPIRole } from "../../../schema/general/enum";
import CountryCode from "../../../schema/general/enum/country-codes";
import { OCPIResponsePayload } from "../../../schema/general/types/responses";
import { OCPICredentials } from "../../../schema/modules/credentials/types";

/**
 * Handle all incoming requests for the Credentials module
 */
export default class OCPIv221CredentialsModuleIncomingRequestService {
    public static async handleGetCredentials(req: Request): Promise<HttpResponse<OCPIResponsePayload<OCPICredentials>>> {

        const credentials: OCPICredentials = {
            token: '1234567890',
            url: 'https://example.com',
            roles: [
                {
                    role: OCPIRole.EMSP,
                    business_details: {
                        name: 'Example',
                    },
                    party_id: '1234567890',
                    country_code: CountryCode.IN,
                },
            ],
        };

        return {
            httpStatus: 200,
            payload: {
                data: credentials,
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            },
        };
    }
}