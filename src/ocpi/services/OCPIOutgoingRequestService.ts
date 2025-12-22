import axios from "axios";
import { logger } from "../../services/logger.service";
import { OCPIRequestLogService } from "./OCPIRequestLogService";
import { OCPILogCommand } from "../types";

// TODO: move this somewhere else
type OutgoingRequestLogParams = {
    // Internal DB IDs (if already resolved)
    location_id?: string;
    evse_id?: string;
    connector_id?: string;
    session_id?: string;
    // OCPI IDs (will be resolved to internal DB IDs)
    ocpi_location_id?: string;
    ocpi_evse_uid?: string;
    ocpi_connector_id?: string;
    ocpi_session_id?: string;
    authorization_reference?: string;
    cpo_session_id?: string;
};

type OutgoingRequestConfig = {
    url: string;
    headers: Record<string, string>;
    data?: any;
    /**
     * OCPI partner_id for which this request is being made (CPO or EMSP).
     * Required for persisting OCPILog; if omitted, DB logging is skipped.
     */
    partnerId?: string;
    /**
     * Optional logical command name for easier debugging (e.g. "LOCATIONS_GET").
     * If omitted, a generic "OUTGOING <METHOD> <url>" is used.
     */
    command?: OCPILogCommand;
    /**
     * Optional log parameters containing IDs for logging.
     * Can contain either internal DB IDs or OCPI IDs (which will be resolved).
     */
    logParams?: OutgoingRequestLogParams;
}
type OutgoingGetRequestConfig = OutgoingRequestConfig & {

}

/**
 * Service for all the OCPI related requests that we have to send to other parties
 */
export default class OCPIOutgoingRequestService {
    public static getAuthorizationHeader(url: string, token: string): string {
        let authorizationHeader = `Token ${token}`;

        return authorizationHeader;
    }

    /**
     * Converts a request command to a response command by replacing "Req" with "Res"
     * @param command The request command (e.g., SendGetLocationReq) - can be undefined
     * @returns The corresponding response command (e.g., SendGetLocationRes) or undefined
     */
    private static getResponseCommand(command?: OCPILogCommand): OCPILogCommand | undefined {
        if (!command) {
            return undefined;
        }
        const commandString = command.toString();
        if (commandString.endsWith('Req')) {
            const responseCommandString = commandString.replace(/Req$/, 'Res');
            // Try to find the corresponding Res command in the enum
            const responseCommand = Object.values(OCPILogCommand).find(
                (cmd) => cmd.toString() === responseCommandString
            );
            return responseCommand || command; // Fallback to original if not found
        }
        return command; // Return as-is if it doesn't end with Req
    }

    static async sendGetRequest(requestConfig: OutgoingGetRequestConfig): Promise<any> {
        const {
            url,
            headers,
            partnerId,
            command,
        } = requestConfig;

        const requestId = headers['X-Request-Id'];
        const correlationId = headers['X-Correlation-Id'];

        logger.info('Outgoing Request', {
            url: url,
            method: 'GET',
            headers: headers,
            requestId: requestId,
            correlationId: correlationId,
            data: {
                url: url,
                method: 'GET',
            },
        });

        // Log outgoing request (EMSP → CPO) - Individual log entry (non-blocking)
        OCPIRequestLogService.logOutgoingRequest({
            url,
            method: 'GET',
            headers,
            partnerId,
            command,
            ...requestConfig.logParams,
        }).catch((error) => {
            // Logging errors should never affect the request flow
            logger.error('Failed to log outgoing request', error as Error);
        });

        return axios.get(url, {
            headers: {
                ...headers,
            },
        })
            .then((response) => {
                logger.info('Outgoing Request Response', {
                    url: url,
                    method: 'GET',
                    headers: headers,
                    requestId: requestId,
                    correlationId: correlationId,
                    data: {
                        url: url,
                        method: 'GET',
                        response: response.data ?? response,
                    },
                });

                // Log incoming response (CPO → EMSP) - Individual log entry (non-blocking)
                const responseCommand = OCPIOutgoingRequestService.getResponseCommand(command);
                OCPIRequestLogService.logOutgoingResponse({
                    url,
                    method: 'GET',
                    headers: response.headers as Record<string, string | number | boolean | undefined>,
                    responseBody: response.data ?? response,
                    statusCode: response.status,
                    partnerId,
                    command: responseCommand,
                    ...requestConfig.logParams,
                }).catch((error) => {
                    // Logging errors should never affect the request flow
                    logger.error('Failed to log outgoing response', error as Error);
                });

                return response;
            })
            .catch((e) => {
                // TODO: handle error in some way
                logger.error('Outgoing Request Error', e, {
                    url: url,
                    method: 'GET',
                    headers: headers,
                    requestId: requestId,
                    correlationId: correlationId,
                    data: {
                        url: url,
                        method: 'GET',
                        error: e,
                    },
                });

                // Log error response - Individual log entry (non-blocking)
                const responseCommand = OCPIOutgoingRequestService.getResponseCommand(command);
                OCPIRequestLogService.logOutgoingResponse({
                    url,
                    method: 'GET',
                    headers,
                    error: e.response?.data || e.message || e,
                    statusCode: e.response?.status,
                    partnerId,
                    command: responseCommand,
                    ...requestConfig.logParams,
                }).catch((error) => {
                    // Logging errors should never affect the request flow
                    logger.error('Failed to log outgoing error response', error as Error);
                });

                return Promise.reject(e);
            });
    }

    static async sendPostRequest(requestConfig: OutgoingRequestConfig): Promise<any> {
        const {
            url,
            headers,
            data = {},
            partnerId,
            command,
        } = requestConfig;

        const requestId = headers['X-Request-Id'];
        const correlationId = headers['X-Correlation-Id'];

        logger.info('Outgoing Request', {
            url: url,
            method: 'POST',
            headers: headers,
            requestId: requestId,
            correlationId: correlationId,
            data: {
                url: url,
                method: 'POST',
                payload: data,
            },
        });

        // Log outgoing request (EMSP → CPO) - Individual log entry (non-blocking)
        OCPIRequestLogService.logOutgoingRequest({
            url,
            method: 'POST',
            headers,
            requestBody: data,
            partnerId,
            command,
            ...requestConfig.logParams,
        }).catch((error) => {
            // Logging errors should never affect the request flow
            logger.error('Failed to log outgoing request', error as Error);
        });

        return axios.post(url, data, {
            headers: {
                ...headers,
                'Content-Type': 'application/json',
            },
        })
            .then((response) => {
                logger.info('Outgoing Request Response', {
                    url: url,
                    method: 'POST',
                    headers: headers,
                    requestId: requestId,
                    correlationId: correlationId,
                    data: {
                        url: url,
                        method: 'POST',
                        payload: data,
                        response: response.data ?? response,
                    },
                });

                // Log incoming response (CPO → EMSP) - Individual log entry (non-blocking)
                const responseCommand = OCPIOutgoingRequestService.getResponseCommand(command);
                OCPIRequestLogService.logOutgoingResponse({
                    url,
                    method: 'POST',
                    headers: response.headers as Record<string, string | number | boolean | undefined>,
                    responseBody: response.data ?? response,
                    statusCode: response.status,
                    partnerId,
                    command: responseCommand,
                    ...requestConfig.logParams,
                }).catch((error) => {
                    // Logging errors should never affect the request flow
                    logger.error('Failed to log outgoing response', error as Error);
                });

                return response.data;
            })
            .catch((e) => {
                // TODO: handle error in some way, etc
                logger.error('Outgoing Request Error', e, {
                    url: url,
                    method: 'POST',
                    headers: headers,
                    requestId: requestId,
                    correlationId: correlationId,
                    data: {
                        url: url,
                        method: 'POST',
                        payload: data,
                        error: e,
                    },
                });

                // Log error response - Individual log entry (non-blocking)
                const responseCommand = OCPIOutgoingRequestService.getResponseCommand(command);
                OCPIRequestLogService.logOutgoingResponse({
                    url,
                    method: 'POST',
                    headers,
                    error: e.response?.data || e.message || e,
                    statusCode: e.response?.status,
                    partnerId,
                    command: responseCommand,
                    ...requestConfig.logParams,
                }).catch((error) => {
                    // Logging errors should never affect the request flow
                    logger.error('Failed to log outgoing error response', error as Error);
                });

                return Promise.reject(e);
            });
    }

    static async sendPutRequest(requestConfig: OutgoingRequestConfig): Promise<any> {
        const {
            url,
            headers,
            data = {},
            partnerId,
            command,
        } = requestConfig;

        const requestId = headers['X-Request-Id'];
        const correlationId = headers['X-Correlation-Id'];

        logger.info('Outgoing Request', {
            url: url,
            method: 'PUT',
            headers: headers,
            requestId: requestId,
            correlationId: correlationId,
            data: {
                url: url,
                method: 'PUT',
                payload: data,
            },
        });

        // Log outgoing request (EMSP → CPO) - Individual log entry (non-blocking)
        OCPIRequestLogService.logOutgoingRequest({
            url,
            method: 'PUT',
            headers,
            requestBody: data,
            partnerId,
            command,
            ...requestConfig.logParams,
        }).catch((error) => {
            // Logging errors should never affect the request flow
            logger.error('Failed to log outgoing request', error as Error);
        });

        return axios.put(url, data, {
            headers: {
                ...headers,
                'Content-Type': 'application/json',
            },
        })
            .then((response) => {
                logger.info('Outgoing Request Response', {
                    url: url,
                    method: 'PUT',
                    headers: headers,
                    requestId: requestId,
                    correlationId: correlationId,
                    data: {
                        url: url,
                        method: 'PUT',
                        payload: data,
                        response: response.data ?? response,
                    },
                });

                // Log incoming response (CPO → EMSP) - Individual log entry (non-blocking)
                OCPIRequestLogService.logOutgoingResponse({
                    url,
                    method: 'PUT',
                    headers: response.headers as Record<string, string | number | boolean | undefined>,
                    responseBody: response.data ?? response,
                    statusCode: response.status,
                    partnerId,
                    command,
                    ...requestConfig.logParams,
                }).catch((error) => {
                    // Logging errors should never affect the request flow
                    logger.error('Failed to log outgoing response', error as Error);
                });

                return response.data;
            })
            .catch((e) => {
                // TODO: handle error in some way, etc
                logger.error('Outgoing Request Error', e, {
                    url: url,
                    method: 'PUT',
                    headers: headers,
                    requestId: requestId,
                    correlationId: correlationId,
                    data: {
                        url: url,
                        method: 'PUT',
                        payload: data,
                        error: e,
                    },
                });

                // Log error response - Individual log entry (non-blocking)
                OCPIRequestLogService.logOutgoingResponse({
                    url,
                    method: 'PUT',
                    headers,
                    error: e.response?.data || e.message || e,
                    statusCode: e.response?.status,
                    partnerId,
                    command,
                    ...requestConfig.logParams,
                }).catch((error) => {
                    // Logging errors should never affect the request flow
                    logger.error('Failed to log outgoing error response', error as Error);
                });

                return Promise.reject(e);
            });
    }

    static async sendPatchRequest(requestConfig: OutgoingRequestConfig): Promise<any> {
        const {
            url,
            headers,
            data = {},
            partnerId,
            command,
        } = requestConfig;

        const requestId = headers['X-Request-Id'];
        const correlationId = headers['X-Correlation-Id'];

        logger.info('Outgoing Request', {
            url: url,
            method: 'PATCH',
            headers: headers,
            requestId: requestId,
            correlationId: correlationId,
            data: {
                url: url,
                method: 'PATCH',
                payload: data,
            },
        });

        // Log outgoing request (EMSP → CPO) - Individual log entry (non-blocking)
        OCPIRequestLogService.logOutgoingRequest({
            url,
            method: 'PATCH',
            headers,
            requestBody: data,
            partnerId,
            command,
            ...requestConfig.logParams,
        }).catch((error) => {
            // Logging errors should never affect the request flow
            logger.error('Failed to log outgoing request', error as Error);
        });

        return axios.patch(url, data, {
            headers: {
                ...headers,
                'Content-Type': 'application/json',
            },
        })
            .then((response) => {
                logger.info('Outgoing Request Response', {
                    url: url,
                    method: 'PATCH',
                    headers: headers,
                    requestId: requestId,
                    correlationId: correlationId,
                    data: {
                        url: url,
                        method: 'PATCH',
                        payload: data,
                        response: response.data ?? response,
                    },
                });

                // Log incoming response (CPO → EMSP) - Individual log entry (non-blocking)
                OCPIRequestLogService.logOutgoingResponse({
                    url,
                    method: 'PATCH',
                    headers: response.headers as Record<string, string | number | boolean | undefined>,
                    responseBody: response.data ?? response,
                    statusCode: response.status,
                    partnerId,
                    command,
                    ...requestConfig.logParams,
                }).catch((error) => {
                    // Logging errors should never affect the request flow
                    logger.error('Failed to log outgoing response', error as Error);
                });

                return response.data;
            })
            .catch((e) => {
                // TODO: handle error in some way, etc
                logger.error('Outgoing Request Error', e, {
                    url: url,
                    method: 'PATCH',
                    headers: headers,
                    requestId: requestId,
                    correlationId: correlationId,
                    data: {
                        url: url,
                        method: 'PATCH',
                        payload: data,
                        error: e,
                    },
                });

                // Log error response - Individual log entry (non-blocking)
                OCPIRequestLogService.logOutgoingResponse({
                    url,
                    method: 'PATCH',
                    headers,
                    error: e.response?.data || e.message || e,
                    statusCode: e.response?.status,
                    partnerId,
                    command,
                    ...requestConfig.logParams,
                }).catch((error) => {
                    // Logging errors should never affect the request flow
                    logger.error('Failed to log outgoing error response', error as Error);
                });

                return Promise.reject(e);
            });
    }

    static async sendDeleteRequest(requestConfig: OutgoingRequestConfig): Promise<any> {
        const {
            url,
            headers,
            data = {},
            partnerId,
            command,
        } = requestConfig;

        const requestId = headers['X-Request-Id'];
        const correlationId = headers['X-Correlation-Id'];

        logger.info('Outgoing Request', {
            url: url,
            method: 'DELETE',
            headers: headers,
            requestId: requestId,
            correlationId: correlationId,
            data: {
                url: url,
                method: 'DELETE',
                payload: data,
            },
        });

        // Log outgoing request (EMSP → CPO) - Individual log entry (non-blocking)
        OCPIRequestLogService.logOutgoingRequest({
            url,
            method: 'DELETE',
            headers,
            requestBody: data,
            partnerId,
            command,
            ...requestConfig.logParams,
        }).catch((error) => {
            // Logging errors should never affect the request flow
            logger.error('Failed to log outgoing request', error as Error);
        });

        return axios.delete(url, {
            headers: {
                ...headers,
            },
        })
            .then((response) => {
                logger.info('Outgoing Request Response', {
                    url: url,
                    method: 'DELETE',
                    headers: headers,
                    requestId: requestId,
                    correlationId: correlationId,
                    data: {
                        url: url,
                        method: 'DELETE',
                        payload: data,
                        response: response.data ?? response,
                    },
                });

                // Log incoming response (CPO → EMSP) - Individual log entry (non-blocking)
                OCPIRequestLogService.logOutgoingResponse({
                    url,
                    method: 'DELETE',
                    headers: response.headers as Record<string, string | number | boolean | undefined>,
                    responseBody: response.data ?? response,
                    statusCode: response.status,
                    partnerId,
                    command,
                    ...requestConfig.logParams,
                }).catch((error) => {
                    // Logging errors should never affect the request flow
                    logger.error('Failed to log outgoing response', error as Error);
                });

                return response.data;
            })
            .catch((e) => {
                // TODO: handle error in some way, etc
                logger.error('Outgoing Request Error', e, {
                    url: url,
                    method: 'DELETE',
                    headers: headers,
                    requestId: requestId,
                    correlationId: correlationId,
                    data: {
                        url: url,
                        method: 'DELETE',
                        payload: data,
                        error: e,
                    },
                });

                // Log error response - Individual log entry (non-blocking)
                OCPIRequestLogService.logOutgoingResponse({
                    url,
                    method: 'DELETE',
                    headers,
                    error: e.response?.data || e.message || e,
                    statusCode: e.response?.status,
                    partnerId,
                    command,
                    ...requestConfig.logParams,
                }).catch((error) => {
                    // Logging errors should never affect the request flow
                    logger.error('Failed to log outgoing error response', error as Error);
                });

                return Promise.reject(e);
            });
    }

}
