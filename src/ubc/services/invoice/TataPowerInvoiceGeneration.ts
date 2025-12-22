/**
 * Tata Power Invoice Generation Service
 * 
 * Generates invoice PDFs using Tata Power's OCPI integration API
 * API Endpoint: POST /generate-pdf/ocpiIntegration/ocpi/cpo/2.2.1/generateinvoice-pdf
 */
import axios from 'axios';
import { logger } from '../../../services/logger.service';
import OCPIPartnerDbService from '../../../db-services/OCPIPartnerDbService';
import { OCPIPartnerAdditionalProps } from '../../../types/OCPIPartner';
import Utils from '../../../utils/Utils';
import {
    InvoiceGenerationRequest,
    InvoiceGenerationResponse,
    TataPowerInvoiceApiResponse,
} from '../../../types/invoice/tata';

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

export default class TataPowerInvoiceGenerationService {
    /**
     * Get Tata Power invoice service credentials from partner configuration
     * @param partnerId - Partner ID to get credentials from
     */
    private static async getCredentials(partnerId: string): Promise<{
        api_url: string;
        auth_token: string;
    } | null> {
        try {
            const ocpiPartner = await OCPIPartnerDbService.getById(partnerId);

            if (!ocpiPartner) {
                logger.warn(`TataPowerInvoice: OCPI Partner not found for partnerId: ${partnerId}`);
                return null;
            }

            const additionalProps = ocpiPartner.additional_props as OCPIPartnerAdditionalProps;
            const tataPowerConfig = additionalProps?.invoice_services?.TataPower;

            if (!tataPowerConfig) {
                logger.warn(`TataPowerInvoice: No Tata Power invoice configuration found for partnerId: ${partnerId}`);
                return null;
            }

            return {
                api_url: tataPowerConfig.API_URL,
                auth_token: tataPowerConfig.AUTH_TOKEN,
            };
        }
        catch (e: unknown) {
            const errorMessage = getErrorMessage(e);
            const err = e instanceof Error ? e : new Error(errorMessage);
            logger.error(`TataPowerInvoice: Failed to get credentials - ${errorMessage}`, err, {
                partnerId,
            });
            return null;
        }
    }

    /**
     * Generate invoice PDF using Tata Power's OCPI integration API
     * 
     * @param request - Invoice generation request payload
     * @param partnerId - Partner ID for credentials
     * @returns Invoice generation response with PDF URL or error
     */
    public async generateInvoicePdf(
        request: InvoiceGenerationRequest,
        partnerId: string
    ): Promise<InvoiceGenerationResponse> {
        // For logging
        const reqId = Utils.generateRandomString(6);

        const logData = {
            reqId,
            partnerId,
            request: {
                ...request,
                // Mask sensitive data in logs
                phone_no: request.phone_no ? `****${request.phone_no.slice(-4)}` : undefined,
            },
        };

        try {
            logger.info(`🟡 [${reqId}] TataPowerInvoice: Starting invoice PDF generation`, logData);

            // Get credentials from partner configuration
            const credentials = await TataPowerInvoiceGenerationService.getCredentials(partnerId);

            if (!credentials) {
                logger.error(`🔴 [${reqId}] TataPowerInvoice: Credentials not found`, undefined, logData);
                return {
                    success: false,
                    error: 'Invoice service credentials not found for partner',
                };
            }

            const { api_url, auth_token } = credentials;

            // Build request headers
            const headers = {
                'Authorization': `Token ${auth_token}`,
                'Content-Type': 'application/json',
            };

            // Build request payload
            const payload = {
                customer_name: request.customer_name,
                gst: request.gst || '',
                charge_session_id: request.charge_session_id,
                state: request.state || '',
                pincode: request.pincode || '',
                phone_no: request.phone_no || '',
                customer_id: request.customer_id,
                address: request.address || '',
            };

            logger.debug(`🟡 [${reqId}] TataPowerInvoice: Sending request to API`, {
                ...logData,
                url: api_url,
            });

            // Make API request
            const response = await axios.post<TataPowerInvoiceApiResponse>(api_url, payload, {
                headers,
                timeout: 30000, // 30 second timeout
            });

            const apiResponse = response.data;

            // Check if the invoice was actually generated (invoice_url is not empty)
            const isInvoiceGenerated = apiResponse.invoice_url && apiResponse.invoice_url.trim() !== '';

            if (!isInvoiceGenerated) {
                // Session was invalid or invoice could not be generated
                logger.warn(`🟡 [${reqId}] TataPowerInvoice: Invoice not generated - ${apiResponse.message}`, {
                    ...logData,
                    statusCode: response.status,
                    responseData: apiResponse,
                });

                return {
                    success: false,
                    message: apiResponse.message || 'Charging session details are incorrect',
                    timestamp: apiResponse.timestamp,
                    raw_response: apiResponse,
                };
            }

            logger.info(`🟢 [${reqId}] TataPowerInvoice: Invoice PDF generated successfully`, {
                ...logData,
                statusCode: response.status,
                responseData: apiResponse,
            });

            return {
                success: true,
                invoice_url: apiResponse.invoice_url,
                message: apiResponse.message,
                timestamp: apiResponse.timestamp,
                raw_response: apiResponse,
            };
        }
        catch (e: unknown) {
            const errorMessage = getErrorMessage(e);
            const errorData = getAxiosErrorData(e);
            const errorStatus = getAxiosErrorStatus(e);
            const err = e instanceof Error ? e : new Error(errorMessage);

            logger.error(`🔴 [${reqId}] TataPowerInvoice: Failed to generate invoice PDF - ${errorMessage}`, err, {
                ...logData,
                errorStatus,
                errorData,
            });

            return {
                success: false,
                error: errorMessage,
                raw_response: errorData,
            };
        }
    }

    /**
     * Static method for generating invoice PDF (convenience method)
     */
    public static async generate(
        request: InvoiceGenerationRequest,
        partnerId: string
    ): Promise<InvoiceGenerationResponse> {
        const service = new TataPowerInvoiceGenerationService();
        return service.generateInvoicePdf(request, partnerId);
    }
}

