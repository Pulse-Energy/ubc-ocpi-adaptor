import { Request } from 'express';
import { HttpResponse } from '../../../../../types/responses';
import { OCPICommandResponseResponse } from '../../../../schema/modules/commands/types/responses';
import { OCPICommandResult } from '../../../../schema/modules/commands/types/requests';
import { OCPIResponseStatusCode } from '../../../../schema/general/enum';
import { logger } from '../../../../../services/logger.service';

/**
 * OCPI 2.2.1 – Commands module (incoming, EMSP side).
 *
 * CPO calls the EMSP's response_url with a CommandResult object:
 *   - Body: OCPICommandResult
 *
 * We accept the result, log it, and answer with a standard OCPI envelope.
 */
export default class OCPIv221CommandsModuleIncomingRequestService {
    /**
     * POST /commands/{command_type}/{command_id}
     *
     * This endpoint is used as the response_url for asynchronous command results.
     */
    public static async handlePostCommand(
        req: Request,
    ): Promise<HttpResponse<OCPICommandResponseResponse>> {
        const { command_type, command_id } = req.params as {
            command_type?: string;
            command_id?: string;
        };

        const result = req.body as OCPICommandResult | undefined;

        logger.info('Received OCPI command result from CPO', {
            command_type,
            command_id,
            result,
        });

        return {
            httpStatus: 200,
            payload: {
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            },
        };
    }
}
