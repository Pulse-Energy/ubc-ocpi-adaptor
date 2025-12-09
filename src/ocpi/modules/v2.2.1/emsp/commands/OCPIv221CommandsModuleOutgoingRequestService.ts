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
    private static async getCpoCommandsBaseUrl(): Promise<string> {
        return Utils.getOcpiEndpoint('commands', 'RECEIVER');
    }

    private static getAuthHeaders(): Record<string, string> {
        const token = process.env.OCPI_CPO_AUTH_TOKEN || '';
        return {
            Authorization: `Token ${token}`,
        };
    }

    private static async sendCommand(
        commandType: OCPICommandType,
        body: OCPICancelReservation | OCPIReserveNow | OCPIStartSession | OCPIStopSession | OCPIUnlockConnector,
    ): Promise<HttpResponse<OCPICommandResponseResponse>> {
        const baseUrl = await OCPIv221CommandsModuleOutgoingRequestService.getCpoCommandsBaseUrl();
        const url = `${baseUrl}/${commandType}`;

        const response = await OCPIOutgoingRequestService.sendPostRequest({
            url,
            headers: OCPIv221CommandsModuleOutgoingRequestService.getAuthHeaders(),
            data: body,
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
    ): Promise<HttpResponse<OCPICommandResponseResponse>> {
        return OCPIv221CommandsModuleOutgoingRequestService.sendCommand(
            OCPICommandType.START_SESSION,
            body,
        );
    }

    public static async sendStopSessionCommand(
        body: OCPIStopSession,
    ): Promise<HttpResponse<OCPICommandResponseResponse>> {
        return OCPIv221CommandsModuleOutgoingRequestService.sendCommand(
            OCPICommandType.STOP_SESSION,
            body,
        );
    }

    public static async sendReserveNowCommand(
        body: OCPIReserveNow,
    ): Promise<HttpResponse<OCPICommandResponseResponse>> {
        return OCPIv221CommandsModuleOutgoingRequestService.sendCommand(
            OCPICommandType.RESERVE_NOW,
            body,
        );
    }

    public static async sendCancelReservationCommand(
        body: OCPICancelReservation,
    ): Promise<HttpResponse<OCPICommandResponseResponse>> {
        return OCPIv221CommandsModuleOutgoingRequestService.sendCommand(
            OCPICommandType.CANCEL_RESERVATION,
            body,
        );
    }

    public static async sendUnlockConnectorCommand(
        body: OCPIUnlockConnector,
    ): Promise<HttpResponse<OCPICommandResponseResponse>> {
        return OCPIv221CommandsModuleOutgoingRequestService.sendCommand(
            OCPICommandType.UNLOCK_CONNECTOR,
            body,
        );
    }

    /**
     * Generic variant that can be used with an Express Request:
     * expects :command_type in params and the raw OCPI command body in req.body.
     */
    public static async sendPostCommand(
        req: Request,
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

        return OCPIv221CommandsModuleOutgoingRequestService.sendCommand(type, body);
    }
}
