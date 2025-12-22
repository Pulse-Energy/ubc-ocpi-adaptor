/**
 * BillDesk Payment Gateway Service
 * Documentation: https://docs.billdesk.io/docs/neo-full-redirect
 * Authentication: https://docs.billdesk.io/reference/authentications-and-endpoints
 * 
 * Implements:
 * - Create Order (Payment Link): https://docs.billdesk.io/reference/createorder
 * - Retrieve Transaction: https://docs.billdesk.io/reference/post-payments-v1_2-transactions-get
 * - Create Refund: https://docs.billdesk.io/reference/createrefund
 * - Retrieve Refund: https://docs.billdesk.io/reference/retrieverefund
 * 
 * JOSE Implementation (as per BillDesk docs):
 * 1. Create JSON payload
 * 2. Encrypt with JWE using encryption key (DIR algorithm, A256GCM)
 * 3. Sign with JWS using signing key (HS256)
 * 4. Send to BillDesk
 * 
 * Response handling:
 * 1. Verify JWS signature with signing key
 * 2. Decrypt JWE with encryption key
 * 3. Parse JSON response
 */
import axios from 'axios';
import * as jose from 'jose';
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

/**
 * Encrypt and sign request payload as per BillDesk JOSE specification
 * Step 1: Encrypt with JWE (DIR + A256GCM)
 * Step 2: Sign with JWS (HS256)
 * 
 * @param payload - JSON payload to encrypt and sign
 * @param clientId - BillDesk client ID
 * @param keyId - Key ID for JWT headers
 * @param encryptionKey - Key/password for JWE encryption
 * @param signingKey - Key/password for JWS signing
 * @returns Signed and encrypted token
 */
const encryptAndSignPayload = async (
    payload: object,
    clientId: string,
    keyId: string,
    encryptionKey: string,
    signingKey: string
): Promise<string> => {
    try {
        // Step 1: Encrypt with JWE (DIR algorithm, A256GCM encryption)
        const encryptionKeyBytes = new TextEncoder().encode(encryptionKey);
        const jweHeader = {
            alg: 'dir' as const,
            enc: 'A256GCM' as const,
            kid: keyId,
            clientid: clientId,
        };
        
        const jwe = await new jose.CompactEncrypt(
            new TextEncoder().encode(JSON.stringify(payload))
        )
            .setProtectedHeader(jweHeader)
            .encrypt(encryptionKeyBytes);

        // Step 2: Sign with JWS (HS256)
        const signingKeyBytes = new TextEncoder().encode(signingKey);
        const jwsHeader = {
            alg: 'HS256' as const,
            kid: keyId,
            clientid: clientId,
        };

        const jws = await new jose.CompactSign(new TextEncoder().encode(jwe))
            .setProtectedHeader(jwsHeader)
            .sign(signingKeyBytes);

        return jws;
    }
    catch (error) {
        const err = error instanceof Error ? error : new Error(getErrorMessage(error));
        logger.error('BillDesk: Failed to encrypt and sign payload', err, { payload });
        throw err;
    }
};

/**
 * Verify and decrypt response from BillDesk
 * Step 1: Verify JWS signature
 * Step 2: Decrypt JWE
 * 
 * @param token - Signed and encrypted token from BillDesk
 * @param encryptionKey - Key for JWE decryption
 * @param signingKey - Key for JWS verification
 * @returns Decrypted JSON payload
 */
const verifyAndDecryptResponse = async (
    token: string,
    encryptionKey: string,
    signingKey: string
): Promise<any> => {
    try {
        // Step 1: Verify JWS signature
        const signingKeyBytes = new TextEncoder().encode(signingKey);
        const { payload: jwsPayload } = await jose.compactVerify(token, signingKeyBytes);
        const jweToken = new TextDecoder().decode(jwsPayload);

        // Step 2: Decrypt JWE
        const encryptionKeyBytes = new TextEncoder().encode(encryptionKey);
        const { plaintext } = await jose.compactDecrypt(jweToken, encryptionKeyBytes);
        
        return JSON.parse(new TextDecoder().decode(plaintext));
    }
    catch (error) {
        const err = error instanceof Error ? error : new Error(getErrorMessage(error));
        logger.error('BillDesk: Failed to verify and decrypt response', err, { token });
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
            key_id: string;
            secret_key: string;
            encryption_key: string;
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
                key_id: credentials.KEY_ID || '',
                proxy_host: credentials.PROXY_HOST || '',
                proxy_port: Number(credentials.PROXY_PORT) || 0,
                secret_key: credentials.SECRET_KEY || '',
                encryption_key: credentials.ENCRYPTION_KEY || '',
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
        let credentials: { encryption_key: string; secret_key: string } | null = null;
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
                key_id: keyId,
                secret_key: secretKey,
                encryption_key: encryptionKey,
                merchant_id: merchantId,
                proxy_host: proxyHost,
                proxy_port: proxyPort,
                api_url: apiUrl,
            } = billDeskCredentials.credentials;

            credentials = { encryption_key: encryptionKey, secret_key: secretKey };
            const billDeskCredentialsId = billDeskCredentials.external_integration_id;

            const updatedOrder: BillDeskCreateOrderRequest = {
                ...order,
                mercid: merchantId,
                currency: '356',
                itemcode: 'DIRECT',
            };

            // Encrypt and sign the payload as per BillDesk JOSE spec
            const signedEncryptedPayload = await encryptAndSignPayload(
                updatedOrder,
                clientId,
                keyId,
                encryptionKey,
                secretKey
            );

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

            const response = await axios.post<string>(
                `${apiUrl}/payments/ve1_2/orders/create`,
                signedEncryptedPayload,
                axiosConfig
            );

            logger.info('BillDesk: Order created - raw response received', {
                order: updatedOrder,
            });

            // Verify and decrypt the response
            const decryptedData = await verifyAndDecryptResponse(
                response.data,
                encryptionKey,
                secretKey
            );

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

            let decryptedErrorData = null;
            if (errorData && credentials) {
                decryptedErrorData = await verifyAndDecryptResponse(
                    errorData,
                    credentials.encryption_key,
                    credentials.secret_key
                );
            }

            logger.error(`BillDesk: Failed to create order - ${errorMessage}`, err, {
                order,
                partnerId,
                response_data: errorData,
                decrypted_data: decryptedErrorData,
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
        let credentials: { encryption_key: string; secret_key: string } | null = null;
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
                key_id: keyId,
                secret_key: secretKey,
                encryption_key: encryptionKey,
                merchant_id: merchantId,
                proxy_host: proxyHost,
                proxy_port: proxyPort,
                api_url: apiUrl,
            } = billDeskCredentials.credentials;

            credentials = { encryption_key: encryptionKey, secret_key: secretKey };

            const payload: BillDeskRetrieveTransactionRequest = {
                orderid,
                mercid: merchantId,
            };

            const headers = {
                'Content-Type': 'application/jose',
                Accept: 'application/jose',
                'BD-Traceid': randomUUID().replace(/-/g, ''),
                'BD-Timestamp': Math.floor(Date.now() / 1000).toString(),
            };

            // Encrypt and sign the payload
            const signedEncryptedPayload = await encryptAndSignPayload(
                payload,
                clientId,
                keyId,
                encryptionKey,
                secretKey
            );

            // Build axios config - only add proxy if host is provided
            const axiosConfig: any = { headers };
            if (proxyHost && proxyPort) {
                axiosConfig.proxy = {
                    host: proxyHost,
                    port: proxyPort,
                    protocol: "http",
                };
            }

            const response = await axios.post<string>(
                `${apiUrl}/payments/ve1_2/transactions/get`,
                signedEncryptedPayload,
                axiosConfig
            );

            logger.info('BillDesk: Transaction retrieved - raw response received', {
                orderid,
                partnerId,
            });

            // Verify and decrypt the response
            const decryptedData = await verifyAndDecryptResponse(
                response.data,
                encryptionKey,
                secretKey
            );

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

            let decryptedErrorData = null;
            if (errorData && credentials) {
                decryptedErrorData = await verifyAndDecryptResponse(
                    errorData,
                    credentials.encryption_key,
                    credentials.secret_key
                );
            }

            if (errorStatus === 404 || errorMessage.includes('404')) {
                logger.error(`BillDesk: Failed to retrieve transaction - ${errorMessage}`, err, {
                    orderid,
                    partnerId,
                    data: decryptedErrorData,
                });
                return { success: false, status: 404 };
            }

            logger.error(`BillDesk: Failed to retrieve transaction - ${errorMessage} - ${errorStatus}`, err, {
                orderid,
                partnerId,
                data: decryptedErrorData,
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
        let credentials: { encryption_key: string; secret_key: string } | null = null;
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
                key_id: keyId,
                secret_key: secretKey,
                encryption_key: encryptionKey,
                merchant_id: merchantId,
                proxy_host: proxyHost,
                proxy_port: proxyPort,
                api_url: apiUrl,
            } = billDeskCredentials.credentials;

            credentials = { encryption_key: encryptionKey, secret_key: secretKey };

            const updatedRequest: BillDeskRefundRequest = {
                ...request,
                currency: '356',
                mercid: merchantId,
            };

            // Encrypt and sign the payload
            const signedEncryptedPayload = await encryptAndSignPayload(
                updatedRequest,
                clientId,
                keyId,
                encryptionKey,
                secretKey
            );

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

            const response = await axios.post(
                `${apiUrl}/payments/ve1_2/refunds/create`,
                signedEncryptedPayload,
                axiosConfig
            );

            logger.info('BillDesk: Refund created - raw response received', {
                request: updatedRequest,
            });

            // Verify and decrypt the response
            const decryptedData: BillDeskRefundResponse = await verifyAndDecryptResponse(
                response.data,
                encryptionKey,
                secretKey
            );

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

            let decryptedErrorData = null;
            if (errorData && credentials) {
                decryptedErrorData = await verifyAndDecryptResponse(
                    errorData,
                    credentials.encryption_key,
                    credentials.secret_key
                );
            }

            logger.error(`BillDesk: Failed to create refund - ${errorMessage}`, err, {
                request,
                partnerId,
                response_data: errorData,
                decrypted_data: decryptedErrorData,
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
        let credentials: { encryption_key: string; secret_key: string } | null = null;
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
                key_id: keyId,
                secret_key: secretKey,
                encryption_key: encryptionKey,
                merchant_id: merchantId,
                proxy_host: proxyHost,
                proxy_port: proxyPort,
                api_url: apiUrl,
            } = billDeskCredentials.credentials;

            credentials = { encryption_key: encryptionKey, secret_key: secretKey };

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

            // Encrypt and sign the payload
            const signedEncryptedPayload = await encryptAndSignPayload(
                payload,
                clientId,
                keyId,
                encryptionKey,
                secretKey
            );

            // Build axios config - only add proxy if host is provided
            const axiosConfig: any = { headers };
            if (proxyHost && proxyPort) {
                axiosConfig.proxy = {
                    host: proxyHost,
                    port: proxyPort,
                    protocol: "http",
                };
            }

            const response = await axios.post<string>(
                `${apiUrl}/payments/ve1_2/refunds/get`,
                signedEncryptedPayload,
                axiosConfig
            );

            logger.info('BillDesk: Refund retrieved - raw response received', { payload });

            // Verify and decrypt the response
            const decryptedData = await verifyAndDecryptResponse(
                response.data,
                encryptionKey,
                secretKey
            );

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
            const errorData = getAxiosErrorData(e);
            const err = e instanceof Error ? e : new Error(errorMessage);

            let decryptedErrorData = null;
            if (errorData && credentials) {
                decryptedErrorData = await verifyAndDecryptResponse(
                    errorData,
                    credentials.encryption_key,
                    credentials.secret_key
                );
            }

            logger.error(`BillDesk: Failed to retrieve refund - ${errorMessage}`, err, {
                mercRefundRefNo,
                partnerId,
                decrypted_data: decryptedErrorData,
            });

            return { success: false };
        }
    }

    /**
     * Decode an encoded JOSE string (for callback handling)
     * Verifies JWS signature and decrypts JWE
     * @param encodedString - Signed and encrypted JOSE string
     * @param partnerId - Partner ID for credentials (optional - uses first available if not provided)
     */
    public static async decodeString(encodedString: string, partnerId?: string): Promise<any> {
        if (partnerId) {
            const billDeskCredentials = await this.getCredentials(partnerId);
            if (billDeskCredentials?.credentials?.secret_key && billDeskCredentials?.credentials?.encryption_key) {
                return verifyAndDecryptResponse(
                    encodedString,
                    billDeskCredentials.credentials.encryption_key,
                    billDeskCredentials.credentials.secret_key
                );
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
