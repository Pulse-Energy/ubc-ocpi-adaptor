import { Request } from 'express';
import { HttpResponse } from '../../../../../types/responses';
import { OCPICommandResponseResponse } from '../../../../schema/modules/commands/types/responses';
import {
    OCPICancelReservation,
    OCPIReserveNow,
    OCPIStartSession,
    OCPIStopSession,
    OCPIUnlockConnector,
} from '../../../../schema/modules/commands/types/requests';
import { OCPICommandType } from '../../../../schema/modules/commands/enums';
import OCPIOutgoingRequestService from '../../../../services/OCPIOutgoingRequestService';
import Utils from '../../../../../utils/Utils';
import { OCPILogCommand } from '../../../../types';

/**
 * OCPI 2.2.1 – Commands module (outgoing, EMSP → CPO).
 *
 * Uses the CPO Commands endpoint (identifier 'commands', role 'RECEIVER') from Utils.getAllEndpoints():
 *   - POST /commands/RESERVE_NOW
 *   - POST /commands/START_SESSION
 *   - POST /commands/STOP_SESSION
 *   - POST /commands/UNLOCK_CONNECTOR
 *   - POST /commands/CANCEL_RESERVATION
 *
 * Request bodies are exactly the OCPI 2.2.1 command request objects.
 * Responses are OCPICommandResponse wrapped in the standard OCPI envelope.
 */
export default class OCPIv221CommandsModuleOutgoingRequestService {
    private static async getCpoCommandsBaseUrl(partnerId?: string): Promise<string> {
        return Utils.getOcpiEndpoint('commands', 'RECEIVER', partnerId);
    }

    private static getAuthHeaders(cpoAuthToken: string): Record<string, string> {
        if (!cpoAuthToken) {
            throw new Error('CPO auth token is required to send OCPI command');
        }

        return {
            Authorization: `Token ${cpoAuthToken}`,
        };
    }

    private static getLogCommandForCommandType(commandType: OCPICommandType): OCPILogCommand {
        switch (commandType) {
            case OCPICommandType.START_SESSION:
                return OCPILogCommand.SendStartSessionPostCommandReq;
            case OCPICommandType.STOP_SESSION:
                return OCPILogCommand.SendStopSessionPostCommandReq;
            case OCPICommandType.RESERVE_NOW:
                return OCPILogCommand.PostStartSessionCommand; // Using existing enum
            case OCPICommandType.CANCEL_RESERVATION:
                return OCPILogCommand.PostStopSessionCommand; // Using existing enum
            case OCPICommandType.UNLOCK_CONNECTOR:
                return OCPILogCommand.PostStartSessionCommand; // Using existing enum
            default:
                return OCPILogCommand.PostStartSessionCommand; // Fallback
        }
    }

    private static async sendCommand(
        commandType: OCPICommandType,
        body: OCPICancelReservation | OCPIReserveNow | OCPIStartSession | OCPIStopSession | OCPIUnlockConnector,
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<HttpResponse<OCPICommandResponseResponse>> {
        const baseUrl = await OCPIv221CommandsModuleOutgoingRequestService.getCpoCommandsBaseUrl(
            partnerId,
        );
        const url = `${baseUrl}/${commandType}`;

        const logCommand = OCPIv221CommandsModuleOutgoingRequestService.getLogCommandForCommandType(commandType);

        const response = await OCPIOutgoingRequestService.sendPostRequest({
            url,
            headers: OCPIv221CommandsModuleOutgoingRequestService.getAuthHeaders(cpoAuthToken),
            data: body,
            partnerId,
            command: logCommand,
        });

        const payload = response as OCPICommandResponseResponse;

        return {
            httpStatus: 200,
            payload,
        };
    }

    /**
     * Convenience helpers for individual commands
     */
    public static async sendStartSessionCommand(
        body: OCPIStartSession,
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<HttpResponse<OCPICommandResponseResponse>> {
        return OCPIv221CommandsModuleOutgoingRequestService.sendCommand(
            OCPICommandType.START_SESSION,
            body,
            cpoAuthToken,
            partnerId,
        );
    }

    public static async sendStopSessionCommand(
        body: OCPIStopSession,
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<HttpResponse<OCPICommandResponseResponse>> {
        return OCPIv221CommandsModuleOutgoingRequestService.sendCommand(
            OCPICommandType.STOP_SESSION,
            body,
            cpoAuthToken,
            partnerId,
        );
    }

    public static async sendReserveNowCommand(
        body: OCPIReserveNow,
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<HttpResponse<OCPICommandResponseResponse>> {
        return OCPIv221CommandsModuleOutgoingRequestService.sendCommand(
            OCPICommandType.RESERVE_NOW,
            body,
            cpoAuthToken,
            partnerId,
        );
    }

    public static async sendCancelReservationCommand(
        body: OCPICancelReservation,
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<HttpResponse<OCPICommandResponseResponse>> {
        return OCPIv221CommandsModuleOutgoingRequestService.sendCommand(
            OCPICommandType.CANCEL_RESERVATION,
            body,
            cpoAuthToken,
            partnerId,
        );
    }

    public static async sendUnlockConnectorCommand(
        body: OCPIUnlockConnector,
        cpoAuthToken: string,
        partnerId?: string,
    ): Promise<HttpResponse<OCPICommandResponseResponse>> {
        return OCPIv221CommandsModuleOutgoingRequestService.sendCommand(
            OCPICommandType.UNLOCK_CONNECTOR,
            body,
            cpoAuthToken,
            partnerId,
        );
    }

    /**
     * Generic variant that can be used with an Express Request:
     * expects :command_type in params and the raw OCPI command body in req.body.
     */
    public static async sendPostCommand(
        req: Request,
        cpoAuthToken: string,
    ): Promise<HttpResponse<OCPICommandResponseResponse>> {
        const { command_type } = req.params as { command_type?: string };
        if (!command_type || !(command_type in OCPICommandType)) {
            throw new Error('Invalid or missing command_type path parameter');
        }

        const type = OCPICommandType[command_type as keyof typeof OCPICommandType];
        const body = req.body as
            | OCPICancelReservation
            | OCPIReserveNow
            | OCPIStartSession
            | OCPIStopSession
            | OCPIUnlockConnector;

        return OCPIv221CommandsModuleOutgoingRequestService.sendCommand(
            type,
            body,
            cpoAuthToken,
        );
    }
}
