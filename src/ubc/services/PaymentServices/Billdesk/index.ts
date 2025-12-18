/**
 * BillDesk Payment Gateway Service
 * Documentation: https://docs.billdesk.io/docs/neo-full-redirect
 * 
 * Implements:
 * - Create Order (Payment Link): https://docs.billdesk.io/reference/createorder
 * - Retrieve Transaction: https://docs.billdesk.io/reference/post-payments-v1_2-transactions-get
 * - Create Refund: https://docs.billdesk.io/reference/createrefund
 * - Retrieve Refund: https://docs.billdesk.io/reference/retrieverefund
 */
import axios from 'axios';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { logger } from '../../../../services/logger.service';
import BillDeskInitializerService from './BillDeskInitializerService';
import {
    BillDeskCreateOrderRequest,
    BillDeskCreateOrderResponse,
    BillDeskRefundRequest,
    BillDeskRefundResponse,
    BillDeskRetrieveRefundRequest,
    BillDeskRetrieveTransactionRequest,
    BillDeskRetrieveTransactionResponse,
    BillDeskPaymentLinkData,
} from '../../../../types/BillDesk';

// Helper function to extract error message from unknown error
const getErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    return 'Unknown error';
};

// Helper function to get axios response data from error
const getAxiosErrorData = (error: unknown): any => {
    if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { data?: any; status?: number } };
        return axiosError.response?.data;
    }
    return undefined;
};

// Helper function to get axios response status from error
const getAxiosErrorStatus = (error: unknown): number | undefined => {
    if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as { response?: { status?: number } };
        return axiosError.response?.status;
    }
    return undefined;
};

const createJWTToken = (payload: object, clientId: string, secretKey: string): string => {
    const header = {
        alg: 'HS256',
        clientid: clientId,
    };
    const token = jwt.sign(payload, secretKey, {
        header,
        expiresIn: 600,
    });
    return token;
};

const getDataFromJWTtoken = (token: string, secretKey: string): any => {
    try {
        const decoded = jwt.verify(token, secretKey);
        return decoded;
    }
    catch (e: unknown) {
        const err = e instanceof Error ? e : new Error(getErrorMessage(e));
        logger.error(`BillDesk: Failed to get data from JWT token`, err, { token });
        return null;
    }
};

export default class BillDeskPaymentGatewayService {
    /**
     * Get credentials from partner configuration
     * @param partnerId - Partner ID to get credentials from
     */
    private static async getCredentials(partnerId: string): Promise<{
        external_integration_id: string;
        credentials: {
            client_id: string;
            secret_key: string;
            merchant_id: string;
            proxy_host: string;
            proxy_port: number;
            api_url: string;
        };
    } | null> {
        const billDeskCredentials = await BillDeskInitializerService.getBillDeskCredentials(partnerId);
        
        if (!billDeskCredentials || !billDeskCredentials.credentials) {
            return null;
        }
        
        const credentials = billDeskCredentials.credentials;
        const billDeskCredentialsId = billDeskCredentials.external_integration_id;
        
        return {
            external_integration_id: billDeskCredentialsId,
            credentials: {
                api_url: credentials.API_URL || '',
                client_id: credentials.CLIENT_ID || '',
                proxy_host: credentials.PROXY_HOST || '',
                proxy_port: Number(credentials.PROXY_PORT) || 0,
                secret_key: credentials.SECRET_KEY || '',
                merchant_id: credentials.MERCHANT_ID || '',
            },
        };
    }

    /**
     * Create a BillDesk order (payment link)
     * @param order - Order request payload
     * @param partnerId - Partner ID for credentials
     */
    public static async createOrder(
        order: BillDeskCreateOrderRequest,
        partnerId: string,
    ): Promise<{
        success: boolean;
        bill_desk_order?: BillDeskCreateOrderResponse;
        external_integration_id?: string;
    }> {
        let savedSecretKey: string | null = null;
        try {
            const billDeskCredentials = await this.getCredentials(partnerId);
            if (!billDeskCredentials || !billDeskCredentials.credentials) {
                logger.error('BillDesk: Failed to create order - External Integration not found', undefined, {
                    order,
                    partnerId,
                });
                return { success: false };
            }

            const {
                client_id: clientId,
                secret_key: secretKey,
                merchant_id: merchantId,
                proxy_host: proxyHost,
                proxy_port: proxyPort,
                api_url: apiUrl,
            } = billDeskCredentials.credentials;

            const billDeskCredentialsId = billDeskCredentials.external_integration_id;
            savedSecretKey = secretKey;

            const updatedOrder: BillDeskCreateOrderRequest = {
                ...order,
                mercid: merchantId,
                currency: '356',
                itemcode: 'DIRECT',
            };

            const jwtToken = createJWTToken(updatedOrder, clientId, secretKey);

            const headers = {
                'Content-Type': 'application/jose',
                Accept: 'application/jose',
                clientid: clientId,
                'BD-Traceid': randomUUID().replace(/-/g, ''),
                'BD-Timestamp': Math.floor(Date.now() / 1000).toString(),
            };

            // Build axios config - only add proxy if host is provided
            const axiosConfig: any = { headers };
            if (proxyHost && proxyPort) {
                axiosConfig.proxy = {
                    host: proxyHost,
                    port: proxyPort,
                    protocol: "http",
                };
            }

            const response = await axios.post<string>(`${apiUrl}/payments/ve1_2/orders/create`, jwtToken, axiosConfig);

            logger.info('BillDesk: Order created successfully', {
                order: updatedOrder,
                responseData: response.data,
            });

            const decryptedData = getDataFromJWTtoken(response.data, secretKey);

            logger.info('BillDesk: Order created successfully - Decrypted Data', {
                order: updatedOrder,
                decryptedData,
            });

            const responseData: BillDeskCreateOrderResponse = decryptedData;

            return {
                bill_desk_order: responseData,
                external_integration_id: billDeskCredentialsId,
                success: true,
            };
        }
        catch (e: unknown) {
            const errorMessage = getErrorMessage(e);
            const errorData = getAxiosErrorData(e);
            const err = e instanceof Error ? e : new Error(errorMessage);

            const data = getDataFromJWTtoken(errorData || 'testing', savedSecretKey || 'testing');

            logger.error(`BillDesk: Failed to create order - ${errorMessage}`, err, {
                order,
                partnerId,
                response_data: errorData,
                decrypted_data: data,
            });

            return { success: false };
        }
    }

    /**
     * Retrieve transaction details from BillDesk
     * @param orderid - Order ID to retrieve
     * @param partnerId - Partner ID for credentials
     */
    public static async retrieveTransaction(
        orderid: string,
        partnerId: string,
    ): Promise<{
        success: boolean;
        response?: BillDeskRetrieveTransactionResponse;
        status?: number;
    }> {
        let savedSecretKey: string | null = null;
        try {
            const billDeskCredentials = await this.getCredentials(partnerId);
            if (!billDeskCredentials || !billDeskCredentials.credentials) {
                logger.error('BillDesk: Failed to retrieve transaction - External Integration not found', undefined, {
                    orderid,
                    partnerId,
                });
                return { success: false };
            }

            const {
                client_id: clientId,
                secret_key: secretKey,
                merchant_id: merchantId,
                proxy_host: proxyHost,
                proxy_port: proxyPort,
                api_url: apiUrl,
            } = billDeskCredentials.credentials;

            const payload: BillDeskRetrieveTransactionRequest = {
                orderid,
                mercid: merchantId,
            };
            savedSecretKey = secretKey;

            const headers = {
                'Content-Type': 'application/jose',
                Accept: 'application/jose',
                'BD-Traceid': randomUUID().replace(/-/g, ''),
                'BD-Timestamp': Math.floor(Date.now() / 1000).toString(),
            };

            const jwtToken = createJWTToken(payload, clientId, secretKey);

            // Build axios config - only add proxy if host is provided
            const axiosConfig: any = { headers };
            if (proxyHost && proxyPort) {
                axiosConfig.proxy = {
                    host: proxyHost,
                    port: proxyPort,
                    protocol: "http",
                };
            }

            const response = await axios.post<string>(`${apiUrl}/payments/ve1_2/transactions/get`, jwtToken, axiosConfig);

            logger.info('BillDesk: Transaction retrieved successfully', {
                orderid,
                partnerId,
            });

            const decryptedData = getDataFromJWTtoken(response.data, secretKey);

            logger.info('BillDesk: Transaction retrieved successfully - Decrypted Data', {
                orderid,
                partnerId,
                decryptedData,
            });

            const responseData: BillDeskRetrieveTransactionResponse = decryptedData;
            return {
                success: true,
                response: responseData,
            };
        }
        catch (e: unknown) {
            const errorMessage = getErrorMessage(e);
            const errorData = getAxiosErrorData(e);
            const errorStatus = getAxiosErrorStatus(e);
            const err = e instanceof Error ? e : new Error(errorMessage);

            const data = getDataFromJWTtoken(errorData || 'testing', savedSecretKey || 'testing');

            if (errorStatus === 404 || errorMessage.includes('404')) {
                logger.error(`BillDesk: Failed to retrieve transaction - ${errorMessage}`, err, {
                    orderid,
                    partnerId,
                    data,
                });
                return { success: false, status: 404 };
            }

            logger.error(`BillDesk: Failed to retrieve transaction - ${errorMessage} - ${errorStatus}`, err, {
                orderid,
                partnerId,
                data,
            });

            return { success: false };
        }
    }

    /**
     * Create a refund request
     * @param request - Refund request payload
     * @param partnerId - Partner ID for credentials
     */
    public static async createRefund(
        request: BillDeskRefundRequest,
        partnerId: string,
    ): Promise<{
        success: boolean;
        data?: BillDeskRefundResponse;
    }> {
        let savedSecretKey: string | null = null;
        try {
            const billDeskCredentials = await this.getCredentials(partnerId);
            if (!billDeskCredentials || !billDeskCredentials.credentials) {
                logger.error('BillDesk: Failed to create refund - External Integration not found', undefined, {
                    request,
                    partnerId,
                });
                return { success: false };
            }

            const {
                client_id: clientId,
                secret_key: secretKey,
                merchant_id: merchantId,
                proxy_host: proxyHost,
                proxy_port: proxyPort,
                api_url: apiUrl,
            } = billDeskCredentials.credentials;

            savedSecretKey = secretKey;

            const updatedRequest: BillDeskRefundRequest = {
                ...request,
                currency: '356',
                mercid: merchantId,
            };

            const jwtToken = createJWTToken(updatedRequest, clientId, secretKey);

            const headers = {
                'Content-Type': 'application/jose',
                Accept: 'application/jose',
                'BD-Traceid': randomUUID().replace(/-/g, ''),
                'BD-Timestamp': Math.floor(Date.now() / 1000).toString(),
            };

            // Build axios config - only add proxy if host is provided
            const axiosConfig: any = { headers };
            if (proxyHost && proxyPort) {
                axiosConfig.proxy = {
                    host: proxyHost,
                    port: proxyPort,
                    protocol: "http",
                };
            }

            const response = await axios.post(`${apiUrl}/payments/ve1_2/refunds/create`, jwtToken, axiosConfig);

            logger.info('BillDesk: Refund created successfully', {
                request: updatedRequest,
            });

            const decryptedData: BillDeskRefundResponse = getDataFromJWTtoken(response.data, secretKey);

            logger.info('BillDesk: Refund created successfully - Decrypted Data', {
                request: updatedRequest,
                decryptedData,
            });

            return {
                success: true,
                data: decryptedData,
            };
        }
        catch (e: unknown) {
            const errorMessage = getErrorMessage(e);
            const errorData = getAxiosErrorData(e);
            const err = e instanceof Error ? e : new Error(errorMessage);

            const data = getDataFromJWTtoken(errorData || 'testing', savedSecretKey || 'testing');

            logger.error(`BillDesk: Failed to create refund - ${errorMessage}`, err, {
                request,
                partnerId,
                response_data: errorData,
                decrypted_data: data,
            });

            return { success: false };
        }
    }

    /**
     * Retrieve refund details
     * @param mercRefundRefNo - Merchant refund reference number
     * @param partnerId - Partner ID for credentials
     */
    public static async retrieveRefund(
        mercRefundRefNo: string,
        partnerId: string,
    ): Promise<{
        success: boolean;
        response?: BillDeskRefundResponse;
    }> {
        try {
            const billDeskCredentials = await this.getCredentials(partnerId);
            if (!billDeskCredentials || !billDeskCredentials.credentials) {
                logger.error('BillDesk: Failed to retrieve refund - External Integration not found', undefined, {
                    mercRefundRefNo,
                    partnerId,
                });
                return { success: false };
            }

            const {
                client_id: clientId,
                secret_key: secretKey,
                merchant_id: merchantId,
                proxy_host: proxyHost,
                proxy_port: proxyPort,
                api_url: apiUrl,
            } = billDeskCredentials.credentials;

            const payload: BillDeskRetrieveRefundRequest = {
                merc_refund_ref_no: mercRefundRefNo,
                mercid: merchantId,
            };

            const headers = {
                'Content-Type': 'application/jose',
                Accept: 'application/jose',
                'BD-Traceid': randomUUID().replace(/-/g, ''),
                'BD-Timestamp': Math.floor(Date.now() / 1000).toString(),
            };

            const jwtToken = createJWTToken(payload, clientId, secretKey);

            // Build axios config - only add proxy if host is provided
            const axiosConfig: any = { headers };
            if (proxyHost && proxyPort) {
                axiosConfig.proxy = {
                    host: proxyHost,
                    port: proxyPort,
                    protocol: "http",
                };
            }

            const response = await axios.post<string>(`${apiUrl}/payments/ve1_2/refunds/get`, jwtToken, axiosConfig);

            logger.info('BillDesk: Refund retrieved successfully', { payload });

            const decryptedData = getDataFromJWTtoken(response.data, secretKey);

            logger.info('BillDesk: Refund retrieved successfully - Decrypted Data', {
                payload,
                decryptedData,
            });

            const decryptedResponse: BillDeskRefundResponse = decryptedData;
            return {
                success: true,
                response: decryptedResponse,
            };
        }
        catch (e: unknown) {
            const errorMessage = getErrorMessage(e);
            const err = e instanceof Error ? e : new Error(errorMessage);

            logger.error(`BillDesk: Failed to retrieve refund - ${errorMessage}`, err, {
                mercRefundRefNo,
                partnerId,
            });

            return { success: false };
        }
    }

    /**
     * Decode an encoded JWT string (for callback handling)
     * @param encodedString - JWT encoded string
     * @param partnerId - Partner ID for credentials (optional - uses first available if not provided)
     */
    public static async decodeString(encodedString: string, partnerId?: string): Promise<any> {
        if (partnerId) {
            const billDeskCredentials = await this.getCredentials(partnerId);
            if (billDeskCredentials?.credentials?.secret_key) {
                return getDataFromJWTtoken(encodedString, billDeskCredentials.credentials.secret_key);
            }
        }
        
        logger.error('BillDesk: Unable to decode string - no valid credentials found');
        return null;
    }

    /**
     * Extract payment link data from Create Order response
     * @param orderResponse - The response from createOrder API
     * @returns Payment link data with URL and parameters
     */
    public static extractPaymentLinkData(orderResponse: BillDeskCreateOrderResponse): BillDeskPaymentLinkData | null {
        try {
            const redirectLink = orderResponse.links?.find(link => link.rel === 'redirect');
            
            if (!redirectLink || !redirectLink.href || !redirectLink.parameters) {
                logger.error('BillDesk: Redirect link not found in order response', undefined, { orderResponse });
                return null;
            }

            return {
                payment_url: redirectLink.href,
                bd_order_id: orderResponse.bdorderid,
                order_id: orderResponse.orderid,
                rdata: redirectLink.parameters.rdata || '',
                merchant_id: redirectLink.parameters.mercid || orderResponse.mercid,
                valid_until: redirectLink.valid_date || '',
            };
        }
        catch (e: unknown) {
            const err = e instanceof Error ? e : new Error(getErrorMessage(e));
            logger.error(`BillDesk: Failed to extract payment link data`, err, { orderResponse });
            return null;
        }
    }

    /**
     * Create a payment link (convenience wrapper)
     */
    public static async createPaymentLink(
        orderId: string,
        amount: string,
        returnUrl: string,
        partnerId: string,
        additionalInfo?: {
            additional_info1?: string;
            additional_info2?: string;
            additional_info3?: string;
            additional_info4?: string;
            additional_info5?: string;
            additional_info6?: string;
            additional_info7?: string;
        },
    ): Promise<{
        success: boolean;
        payment_link_data?: BillDeskPaymentLinkData;
        bill_desk_order?: BillDeskCreateOrderResponse;
        external_integration_id?: string;
        error?: string;
    }> {
        try {
            const orderRequest: BillDeskCreateOrderRequest = {
                mercid: '',
                orderid: orderId,
                amount: amount,
                order_date: new Date().toISOString(),
                currency: '356',
                ru: returnUrl,
                itemcode: 'DIRECT',
                additional_info: additionalInfo,
            };

            const createOrderResult = await this.createOrder(orderRequest, partnerId);

            if (!createOrderResult.success || !createOrderResult.bill_desk_order) {
                return {
                    success: false,
                    error: 'Failed to create order with BillDesk',
                };
            }

            const paymentLinkData = this.extractPaymentLinkData(createOrderResult.bill_desk_order);

            if (!paymentLinkData) {
                return {
                    success: false,
                    error: 'Failed to extract payment link data from order response',
                };
            }

            return {
                success: true,
                payment_link_data: paymentLinkData,
                bill_desk_order: createOrderResult.bill_desk_order,
                external_integration_id: createOrderResult.external_integration_id,
            };
        }
        catch (e: unknown) {
            const errorMessage = getErrorMessage(e);
            const err = e instanceof Error ? e : new Error(errorMessage);

            logger.error(`BillDesk: Failed to create payment link - ${errorMessage}`, err, {
                orderId,
                amount,
                returnUrl,
                partnerId,
            });

            return {
                success: false,
                error: errorMessage,
            };
        }
    }

    // Status check helpers
    public static isTransactionSuccessful(authStatus: string): boolean {
        return authStatus === '0300';
    }

    public static isTransactionFailed(authStatus: string): boolean {
        return authStatus === '0399';
    }

    public static isTransactionPending(authStatus: string): boolean {
        return authStatus === '0002' || authStatus === '0001';
    }

    public static isRefundSuccessful(refundStatus: string): boolean {
        return refundStatus === 'refund_successful';
    }

    public static isRefundPending(refundStatus: string): boolean {
        return refundStatus === 'refund_pending' || refundStatus === 'refund_initiated';
    }

    public static isRefundFailed(refundStatus: string): boolean {
        return refundStatus === 'refund_failed';
    }
}
