import { Response } from "express";
import axios from "axios";
import { logger } from "../../services/logger.service";

// TODO: move this somewhere else
type OutgoingRequestConfig = {
    url: string
    headers: Record<string, string>
    data?: any,
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

    static async sendGetRequest(requestConfig: OutgoingGetRequestConfig, res?: Response): Promise<any> {
        const {
            url,
            headers,
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

        /**
         * @todo Add outgoing request DB log
         */

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

                /**
                 * @todo Add incoming response DB log
                 */

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

                return Promise.reject(e);
            });
    }

    static async sendPostRequest(requestConfig: OutgoingRequestConfig, res?: Response): Promise<any> {
        const {
            url,
            headers,
            data = {},
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

        /**
         * @todo Add outgoing request DB log
         */

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
                        payload: data,response: response.data ?? response,
                    },
                });

                /**
                 * @todo Add incoming response DB log
                 */

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
                        payload: data,error: e,
                    },
                });

                return Promise.reject(e);
            });
    }

    static async sendPutRequest(requestConfig: OutgoingRequestConfig, res?: Response): Promise<any> {
        const {
            url,
            headers,
            data = {},
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

        /**
         * @todo Add outgoing request DB log
         */

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

                /**
                 * @todo Add incoming response DB log
                 */

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

                return Promise.reject(e);
            });
    }

    static async sendPatchRequest(requestConfig: OutgoingRequestConfig, res?: Response): Promise<any> {
        const {
            url,
            headers,
            data = {},
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

        /**
         * @todo Add outgoing request DB log
         */

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

                /**
                 * @todo Add incoming response DB log
                 */

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

                return Promise.reject(e);
            });
    }

    static async sendDeleteRequest(requestConfig: OutgoingRequestConfig, res?: Response): Promise<any> {
        const {
            url,
            headers,
            data = {},
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

        /**
         * @todo Add outgoing request DB log
         */

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

                /**
                 * @todo Add incoming response DB log
                 */

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

                return Promise.reject(e);
            });
    }

}
