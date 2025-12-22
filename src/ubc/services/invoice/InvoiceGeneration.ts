/**
 * Common Invoice Generation Service
 * Routes to the appropriate invoice provider based on partner configuration
 */
import { logger } from '../../../services/logger.service';
import OCPIPartnerDbService from '../../../db-services/OCPIPartnerDbService';
import { InvoiceServiceProvider, OCPIPartnerAdditionalProps } from '../../../types/OCPIPartner';
import { InvoiceGenerationRequest, InvoiceGenerationResponse } from '../../../types/invoice/tata';
import TataPowerInvoiceGenerationService from './TataPowerInvoiceGeneration';
import { SessionDbService } from '../../../db-services/SessionDbService';
import { BecknBuyer } from '../../schema/v2.0.0/types/Buyer';

export default class InvoiceGenerationService {
    /**
     * Generate invoice PDF using the configured invoice provider for the partner
     * 
     * @param request - Invoice generation request payload
     * @param partnerId - Partner ID to get configuration from
     * @returns Invoice generation response
     */
    public static async generateInvoice(
        authorization_reference: string,
        partnerId: string
    ): Promise<InvoiceGenerationResponse> {
        try {
            // Get partner configuration
            const partner = await OCPIPartnerDbService.getById(partnerId);

            if (!partner) {
                logger.error(`InvoiceGeneration: Partner not found`, undefined, { partnerId });
                return {
                    success: false,
                    error: 'Partner not found',
                };
            }

            const session = await SessionDbService.getByAuthorizationReference(authorization_reference);

            if (!session) {
                logger.error(`InvoiceGeneration: Session not found`, undefined, { authorization_reference });
                return {
                    success: false,
                    error: 'Session not found',
                };
            }

            const buyerInfo = session.buyer_info as BecknBuyer;

            const request: InvoiceGenerationRequest = {
                customer_name: buyerInfo['beckn:name'] ?? '',
                gst: buyerInfo['beckn:taxId'] ?? '',
                charge_session_id: authorization_reference,
                phone_no: buyerInfo['beckn:phone'] ?? '',
                customer_id: buyerInfo['beckn:id'] ?? '',
                address: buyerInfo['beckn:address'] ?? '',

            };

            const additionalProps = partner.additional_props as OCPIPartnerAdditionalProps;
            const invoiceProvider = additionalProps?.invoice_service_provider;

            if (!invoiceProvider) {
                logger.error(`InvoiceGeneration: No invoice service provider configured for partner`, undefined, { partnerId });
                return {
                    success: false,
                    error: 'No invoice service provider configured for partner',
                };
            }

            // Route to the appropriate provider
            switch (invoiceProvider) {
                case InvoiceServiceProvider.TataPower:
                    return await TataPowerInvoiceGenerationService.generate(request, partnerId);

                default:
                    logger.error(`InvoiceGeneration: Unsupported invoice provider: ${invoiceProvider}`, undefined, { partnerId });
                    return {
                        success: false,
                        error: `Unsupported invoice provider: ${invoiceProvider}`,
                    };
            }
        }
        catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : 'Unknown error';
            const err = e instanceof Error ? e : new Error(errorMessage);
            logger.error(`InvoiceGeneration: Failed to generate invoice - ${errorMessage}`, err, {
                partnerId,
                authorization_reference,
            });

            return {
                success: false,
                error: errorMessage,
            };
        }
    }
}

