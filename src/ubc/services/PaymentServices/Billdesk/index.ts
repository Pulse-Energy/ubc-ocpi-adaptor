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
 * - Create Link: https://docs.billdesk.io/reference/create-link
 * - Retrieve Link: https://docs.billdesk.io/reference/retrieve-link
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
import { randomUUID, webcrypto } from 'crypto';
import { logger } from '../../../../services/logger.service';

// Polyfill crypto for Node.js (required by jose library)
if (typeof globalThis.crypto === 'undefined') {
    (globalThis as any).crypto = webcrypto;
}
import BillDeskInitializerService from './BillDeskInitializerService';
import {
    BillDeskCreateOrderRequest,
    BillDeskCreateOrderResponse,
    BillDeskCreateLinkRequest,
    BillDeskCreateLinkResponse,
    BillDeskRefundRequest,
    BillDeskRefundResponse,
    BillDeskRetrieveRefundRequest,
    BillDeskRetrieveLinkRequest,
    BillDeskRetrieveLinkResponse,
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
 * Reference: https://docs.billdesk.io/reference/authentications-and-endpoints
 * 
 * Step 1: Encrypt with JWE (DIR algorithm, A256GCM encryption)
 *   - Header includes: alg=dir, enc=A256GCM, kid=keyId, clientid=clientId
 * Step 2: Sign with JWS (HS256 algorithm)
 *   - Header includes: alg=HS256, kid=keyId, clientid=clientId
 * 
 * @param payload - JSON payload to encrypt and sign
 * @param clientId - BillDesk client ID
 * @param keyId - Key ID for JWT headers (provided by BillDesk)
 * @param encryptionKey - Key/password for JWE encryption (32 bytes for A256GCM)
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
        logger.info('BillDesk: Starting JOSE encrypt and sign', {
            clientId,
            keyId,
            encryptionKeyLength: encryptionKey?.length,
            signingKeyLength: signingKey?.length,
            payloadKeys: Object.keys(payload),
        });

        // Step 1: Encrypt with JWE (DIR algorithm, A256GCM encryption)
        // JWE Header: { alg: "dir", enc: "A256GCM", kid: keyId, clientid: clientId }
        const encryptionKeyBytes = new TextEncoder().encode(encryptionKey);
        const jweHeader = {
            alg: 'dir' as const,
            enc: 'A256GCM' as const,
            kid: keyId,
            clientid: clientId,
        };
        
        const jweEncryptedData = await new jose.CompactEncrypt(
            new TextEncoder().encode(JSON.stringify(payload))
        )
            .setProtectedHeader(jweHeader)
            .encrypt(encryptionKeyBytes);

        logger.info('BillDesk: Payload encrypted with JWE', {
            jweLength: jweEncryptedData.length,
        });

        // Step 2: Sign with JWS (HS256) - sign the encrypted JWE data
        // JWS Header: { alg: "HS256", kid: "HMAC", clientid: clientId }
        // Note: BillDesk uses "HMAC" as kid for JWS signing, while keyId is used for JWE encryption
        const signingKeyBytes = new TextEncoder().encode(signingKey);
        const jwsHeader = {
            alg: 'HS256' as const,
            kid: 'HMAC',
            clientid: clientId,
        };

        const jwsSignedData = await new jose.CompactSign(
            new TextEncoder().encode(jweEncryptedData)
        )
            .setProtectedHeader(jwsHeader)
            .sign(signingKeyBytes);

        logger.info('BillDesk: Encrypted payload signed with JWS', {
            jwsLength: jwsSignedData.length,
        });

        return jwsSignedData;
    }
    catch (error) {
        const err = error instanceof Error ? error : new Error(getErrorMessage(error));
        logger.error('BillDesk: Failed to encrypt and sign payload', err, { payload });
        throw err;
    }
};

/**
 * Verify and decrypt response from BillDesk
 * Reference: https://docs.billdesk.io/reference/authentications-and-endpoints
 * 
 * Step 1: Verify JWS signature using signing key
 * Step 2: Decrypt JWE using encryption key
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
        if (typeof token !== 'string') {
            logger.warn('BillDesk: Response token is not a string', { tokenType: typeof token });
            return token; // Return as-is if it's already parsed JSON
        }

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
        logger.error('BillDesk: Failed to verify and decrypt response', err, { 
            tokenType: typeof token,
            tokenPreview: typeof token === 'string' ? token.substring(0, 100) : 'non-string',
        });
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
        error?: string;
        error_details?: any;
    }> {
        let credentials: { encryption_key: string; secret_key: string } | null = null;
        try {
            const billDeskCredentials = await this.getCredentials(partnerId);
            if (!billDeskCredentials || !billDeskCredentials.credentials) {
                logger.error('BillDesk: Failed to create order - External Integration not found', undefined, {
                            order,
                    partnerId,
                });
                return { success: false, error: 'BillDesk credentials not found for partner' };
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

            logger.info('BillDesk: Creating order with credentials', {
                merchantId,
                clientId,
                keyId,
                apiUrl,
                encryptionKeyLength: encryptionKey?.length,
                secretKeyLength: secretKey?.length,
            });

            // Encrypt and sign the payload as per BillDesk JOSE spec
            const signedEncryptedPayload = await encryptAndSignPayload(
                updatedOrder,
                clientId,
                keyId,
                encryptionKey,
                secretKey
            );

            const traceId = randomUUID().replace(/-/g, '');
            const timestamp = Math.floor(Date.now() / 1000).toString();

            const headers = {
                'Content-Type': 'application/jose',
                Accept: 'application/jose',
                'BD-Traceid': traceId,
                'BD-Timestamp': timestamp,
            };

            logger.info('BillDesk: Sending request to create order', {
                url: `${apiUrl}/payments/ve1_2/orders/create`,
                traceId,
                timestamp,
                payloadPreview: signedEncryptedPayload.substring(0, 100) + '...',
            });

            const response = await axios.post<string>(`${apiUrl}/payments/ve1_2/orders/create`, signedEncryptedPayload, {
                headers,
                proxy: proxyHost && proxyPort ? {
                    host: proxyHost,
                    port: proxyPort,
                    protocol: "http",
                } : false,
            });

            logger.info('BillDesk: Order created - raw response received', {
                        order: updatedOrder,
                statusCode: response.status,
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

            // Get more error details from axios error
            const axiosError = e as any;
            const statusCode = axiosError?.response?.status;
            const responseHeaders = axiosError?.response?.headers;
            const rawResponseData = axiosError?.response?.data;

            logger.error(`BillDesk: Failed to create order - ${errorMessage}`, err, {
                order,
                partnerId,
                statusCode,
                responseHeaders,
                rawResponseData,
                response_data: errorData,
                decrypted_data: decryptedErrorData,
            });

            // Prefer decrypted error data if available (for JOSE encrypted responses)
            // Otherwise try to parse raw response as JSON
            let parsedError = decryptedErrorData || rawResponseData;
            if (!decryptedErrorData && typeof rawResponseData === 'string') {
                try {
                    parsedError = JSON.parse(rawResponseData);
                }
                catch {
                    // Keep as string if not valid JSON
                }
            }

            return {
                success: false,
                error: parsedError?.message || `${errorMessage} (Status: ${statusCode})`,
                error_details: {
                    billdesk_error: parsedError,
                    status_code: statusCode,
                    error_code: parsedError?.error_code,
                    error_type: parsedError?.error_type,
                },
            };
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

            const response = await axios.post<string>(`${apiUrl}/payments/ve1_2/transactions/get`, signedEncryptedPayload, {
                headers,
                proxy: proxyHost && proxyPort ? {
                    host: proxyHost,
                    port: proxyPort,
                    protocol: "http",
                } : false,
            });

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

            const response = await axios.post(`${apiUrl}/payments/ve1_2/refunds/create`, signedEncryptedPayload, {
                headers,
                proxy: proxyHost && proxyPort ? {
                    host: proxyHost,
                    port: proxyPort,
                    protocol: "http",
                } : false,
            });

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

            const response = await axios.post<string>(`${apiUrl}/payments/ve1_2/refunds/get`, signedEncryptedPayload, {
                headers,
                proxy: proxyHost && proxyPort ? {
                    host: proxyHost,
                    port: proxyPort,
                    protocol: "http",
                } : false,
            });

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
     * Create a Payment Link
     * Reference: https://docs.billdesk.io/reference/create-link
     * @param request - Create Link request payload
     * @param partnerId - Partner ID for credentials
     */
    public static async createLink(
        request: BillDeskCreateLinkRequest,
        partnerId: string,
    ): Promise<{
        success: boolean;
        link?: BillDeskCreateLinkResponse;
        error?: string;
        error_details?: any;
    }> {
        let credentials: { encryption_key: string; secret_key: string } | null = null;
        try {
            const billDeskCredentials = await this.getCredentials(partnerId);
            if (!billDeskCredentials || !billDeskCredentials.credentials) {
                logger.error('BillDesk: Failed to create link - External Integration not found', undefined, {
                    request,
                    partnerId,
                });
                return { success: false, error: 'BillDesk credentials not found for partner' };
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

            // Set merchant ID in request
            const updatedRequest: BillDeskCreateLinkRequest = {
                ...request,
                mercid: merchantId,
            };

            // Note: Payment Links use a different base URL (linkpay instead of u2)
            const linkPayUrl = apiUrl.replace('/u2', '');
            
            logger.info('BillDesk: Creating payment link', {
                linkrefno: updatedRequest.linkrefno,
                mercid: updatedRequest.mercid,
                amount: updatedRequest.amount,
                partnerId,
                apiUrl: `${linkPayUrl}/linkpay/links/create`,
                proxyEnabled: !!(proxyHost && proxyPort),
            });

            const headers = {
                'Content-Type': 'application/jose',
                Accept: 'application/jose',
                'BD-Traceid': randomUUID().replace(/-/g, ''),
                'BD-Timestamp': Math.floor(Date.now() / 1000).toString(),
            };

            // Encrypt and sign the payload
            const signedEncryptedPayload = await encryptAndSignPayload(
                updatedRequest,
                clientId,
                keyId,
                encryptionKey,
                secretKey
            );

            const response = await axios.post<string>(`${linkPayUrl}/linkpay/links/create`, signedEncryptedPayload, {
                headers,
                proxy: proxyHost && proxyPort ? {
                    host: proxyHost,
                    port: proxyPort,
                    protocol: "http",
                } : false,
            });

            logger.info('BillDesk: Link created - raw response received', {
                linkrefno: updatedRequest.linkrefno,
                statusCode: response.status,
            });

            // Verify and decrypt the response
            const decryptedData = await verifyAndDecryptResponse(
                response.data,
                encryptionKey,
                secretKey
            );

            logger.info('BillDesk: Link created successfully - Decrypted Data', {
                linkrefno: updatedRequest.linkrefno,
                decryptedData,
            });

            const responseData: BillDeskCreateLinkResponse = decryptedData;

            return {
                success: true,
                link: responseData,
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

            const axiosError = e as any;
            const statusCode = axiosError?.response?.status;
            const rawResponseData = axiosError?.response?.data;

            logger.error(`BillDesk: Failed to create link - ${errorMessage}`, err, {
                request,
                partnerId,
                statusCode,
                rawResponseData,
                decrypted_data: decryptedErrorData,
            });

            let parsedError = decryptedErrorData || rawResponseData;
            if (!decryptedErrorData && typeof rawResponseData === 'string') {
                try {
                    parsedError = JSON.parse(rawResponseData);
                }
                catch {
                    // Keep as string
                }
            }

            return {
                success: false,
                error: parsedError?.message || `${errorMessage} (Status: ${statusCode})`,
                error_details: {
                    billdesk_error: parsedError,
                    status_code: statusCode,
                    error_code: parsedError?.error_code,
                    error_type: parsedError?.error_type,
                },
            };
        }
    }

    /**
     * Retrieve a Payment Link status
     * Reference: https://docs.billdesk.io/reference/retrieve-link
     * @param linkrefno - Link reference number (or use bdlinkid)
     * @param partnerId - Partner ID for credentials
     * @param bdlinkid - BillDesk Link ID (optional, use instead of linkrefno)
     */
    public static async retrieveLink(
        linkrefno: string | undefined,
        partnerId: string,
        bdlinkid?: string,
    ): Promise<{
        success: boolean;
        link?: BillDeskRetrieveLinkResponse;
        error?: string;
    }> {
        let credentials: { encryption_key: string; secret_key: string } | null = null;
        try {
            const billDeskCredentials = await this.getCredentials(partnerId);
            if (!billDeskCredentials || !billDeskCredentials.credentials) {
                logger.error('BillDesk: Failed to retrieve link - External Integration not found', undefined, {
                    linkrefno,
                    bdlinkid,
                    partnerId,
                });
                return { success: false, error: 'BillDesk credentials not found for partner' };
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

            const payload: BillDeskRetrieveLinkRequest = {
                mercid: merchantId,
                ...(linkrefno && { linkrefno }),
                ...(bdlinkid && { bdlinkid }),
            };

            logger.info('BillDesk: Retrieving payment link', {
                linkrefno,
                bdlinkid,
                partnerId,
            });

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

            // Note: Payment Links use a different base URL (linkpay instead of u2)
            const linkPayUrl = apiUrl.replace('/u2', '');
            const response = await axios.post<string>(`${linkPayUrl}/linkpay/links/fetch`, signedEncryptedPayload, {
                headers,
                proxy: proxyHost && proxyPort ? {
                    host: proxyHost,
                    port: proxyPort,
                    protocol: "http",
                } : false,
            });

            logger.info('BillDesk: Link retrieved - raw response received', {
                linkrefno,
                bdlinkid,
                statusCode: response.status,
            });

            // Verify and decrypt the response
            const decryptedData = await verifyAndDecryptResponse(
                response.data,
                encryptionKey,
                secretKey
            );

            logger.info('BillDesk: Link retrieved successfully - Decrypted Data', {
                linkrefno,
                bdlinkid,
                decryptedData,
            });

            const responseData: BillDeskRetrieveLinkResponse = decryptedData;

            return {
                success: true,
                link: responseData,
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
                logger.error(`BillDesk: Link not found - ${errorMessage}`, err, {
                    linkrefno,
                    bdlinkid,
                    partnerId,
                    data: decryptedErrorData,
                });
                return { success: false, error: 'Link not found' };
            }

            logger.error(`BillDesk: Failed to retrieve link - ${errorMessage}`, err, {
                linkrefno,
                bdlinkid,
                partnerId,
                decrypted_data: decryptedErrorData,
            });

            return { success: false, error: errorMessage };
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
