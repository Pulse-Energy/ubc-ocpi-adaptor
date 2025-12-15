import { Request, Response } from 'express';
import { HttpResponse } from '../../../../../types/responses';
import { OCPICommandResponseResponse } from '../../../../schema/modules/commands/types/responses';
import { OCPICommandResult } from '../../../../schema/modules/commands/types/requests';
import { OCPIResponseStatusCode } from '../../../../schema/general/enum';
import { logger } from '../../../../../services/logger.service';
import { databaseService } from '../../../../../services/database.service';
import { OCPIPartnerCredentials } from '@prisma/client';
import { OCPISessionStatus } from '../../../../schema/modules/sessions/enums';
import { OCPICommandResultType, OCPICommandType } from '../../../../schema/modules/commands/enums';
import { OCPIRequestLogService } from '../../../../services/OCPIRequestLogService';
import { OCPILogCommand } from '../../../../types';

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
        res: Response,
        partnerCredentials: OCPIPartnerCredentials,
    ): Promise<HttpResponse<OCPICommandResponseResponse>> {
        // Log incoming request (non-blocking)
        OCPIRequestLogService.logRequest({
            req,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.PostCommandResultReq,
        });

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

        let status = OCPISessionStatus.ACTIVE;
        let session = null;

        if (command_type === OCPICommandType.START_SESSION) {
            if (result?.result !== OCPICommandResultType.ACCEPTED) {
                status = OCPISessionStatus.INVALID;
            }
            session = await databaseService.prisma.session.findFirst({
                where: {
                    authorization_reference: command_id,
                },
            });
        } 
        else if (command_type === OCPICommandType.STOP_SESSION) {
            if (result?.result == OCPICommandResultType.ACCEPTED) {
                status = OCPISessionStatus.COMPLETED;
            }
            session = await databaseService.prisma.session.findFirst({
                where: {
                    cpo_session_id: command_id,
                },
            });
        }

        if (!session) {
            const response = {
                httpStatus: 404,
                payload: {
                    status_code: OCPIResponseStatusCode.status_2001,
                    timestamp: new Date().toISOString(),
                },
            };

            // Log outgoing response (non-blocking)
            OCPIRequestLogService.logResponse({
                req,
                res,
                responseBody: response.payload,
                statusCode: response.httpStatus,
                partnerId: partnerCredentials.partner_id,
                command: OCPILogCommand.PostCommandResultRes,
            });

            return response;
        }
        
        // update the session status
        await databaseService.prisma.session.update({
            where: { id: session?.id },
            data: {
                status,
            },
        });

        const response = {
            httpStatus: 200,
            payload: {
                status_code: OCPIResponseStatusCode.status_1000,
                timestamp: new Date().toISOString(),
            },
        };

        // Log outgoing response (non-blocking)
        OCPIRequestLogService.logResponse({
            req,
            res,
            responseBody: response.payload,
            statusCode: response.httpStatus,
            partnerId: partnerCredentials.partner_id,
            command: OCPILogCommand.PostCommandResultRes,
        });

        return response;
    }
}
