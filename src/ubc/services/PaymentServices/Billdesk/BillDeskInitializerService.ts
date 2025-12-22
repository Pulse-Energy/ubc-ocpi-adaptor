/**
 * BillDesk External Integration Service
 * Manages credentials and configuration for BillDesk payment gateway
 * Gets credentials from OCPIPartnerAdditionalProps
 */
import { logger } from "../../../../services/logger.service";
import { BillDeskCredentials } from "../../../../types/BillDesk";
import OCPIPartnerDbService from "../../../../db-services/OCPIPartnerDbService";
import { OCPIPartnerAdditionalProps } from "../../../../types/OCPIPartner";

// Types
interface BillDeskCacheEntry {
    external_integration_id: string;
    credentials: BillDeskCredentials;
    partner_id: string;
}

interface CacheEntry {
    time: Date;
    bill_desk?: BillDeskCacheEntry;
}

type CacheStore = {
    [partnerId: string]: CacheEntry;
};

export default class BillDeskInitializerService {
    private static cache: CacheStore = {};

    /**
     * Get BillDesk external integration parameters from OCPIPartner
     * Uses caching to avoid repeated database lookups
     * 
     * @param partnerId - Partner ID to get credentials from
     * @returns BillDesk credentials and configuration
     */
    public static async getBillDeskCredentials(
        partnerId: string
    ): Promise<BillDeskCacheEntry | null> {
        const cacheKey = partnerId;
        
        try {
            const expiryTime = 60 * 60 * 1000; // 60 minutes

            // Check if cached and not expired
            const cachedEntry = this.cache[cacheKey];
            if (cachedEntry && cachedEntry.time > new Date() && cachedEntry.bill_desk) {
                return cachedEntry.bill_desk;
            }

            // Fetch from database using OCPIPartnerDbService
            const ocpiPartner = await OCPIPartnerDbService.getById(partnerId);
            
            if (!ocpiPartner) {
                logger.warn(`BillDesk: OCPI Partner not found for partnerId: ${partnerId}`);
                return null;
            }

            const additionalProps = ocpiPartner.additional_props as OCPIPartnerAdditionalProps;
            const billDeskConfig = additionalProps?.payment_services?.BillDesk;

            if (!billDeskConfig) {
                logger.warn(`BillDesk: No BillDesk configuration found in partner config for partnerId: ${partnerId}`);
                return null;
            }

            // Map OCPIPartnerAdditionalProps to BillDeskCredentials
            const credentials: BillDeskCredentials = {
                API_URL: billDeskConfig.API_URL,
                CLIENT_ID: billDeskConfig.CLIENT_ID,
                KEY_ID: billDeskConfig.KEY_ID,
                SECRET_KEY: billDeskConfig.SECRET_KEY,
                ENCRYPTION_KEY: billDeskConfig.ENCRYPTION_KEY,
                MERCHANT_ID: billDeskConfig.MERCHANT_ID,
            };

            // Validate that we have all required credentials
            if (!credentials.API_URL || !credentials.CLIENT_ID || !credentials.KEY_ID || 
                !credentials.SECRET_KEY || !credentials.ENCRYPTION_KEY || !credentials.MERCHANT_ID) {
                logger.error(`BillDesk: Missing required credentials in partner config`, undefined, {
                    partnerId,
                    hasApiUrl: !!credentials.API_URL,
                    hasClientId: !!credentials.CLIENT_ID,
                    hasKeyId: !!credentials.KEY_ID,
                    hasSecretKey: !!credentials.SECRET_KEY,
                    hasEncryptionKey: !!credentials.ENCRYPTION_KEY,
                    hasMerchantId: !!credentials.MERCHANT_ID,
                });
                return null;
            }

            logger.info(`BillDesk credentials loaded from partner config for partnerId: ${partnerId}`);

            // Cache the credentials
            const cacheEntry: BillDeskCacheEntry = {
                external_integration_id: partnerId,
                credentials: credentials,
                partner_id: partnerId,
            };

            this.cache[cacheKey] = {
                time: new Date(Date.now() + expiryTime),
                bill_desk: cacheEntry,
            };

            return cacheEntry;
        }
        catch (error: unknown) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error(`Error in fetching BillDesk credentials`, err, { partnerId });
            return null;
        }
    }

    /**
     * Clear cache for a specific partner or all partners
     * @param partnerId - Optional partner ID to clear cache for
     */
    public static clearCache(partnerId?: string): void {
        if (partnerId) {
            delete this.cache[partnerId];
            logger.info(`BillDesk cache cleared for partnerId: ${partnerId}`);
        }
        else {
            this.cache = {};
            logger.info('BillDesk cache cleared for all partners');
        }
    }
}
