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
                logger.warn(`BillDesk: No BillDesk configuration found for partnerId: ${partnerId}`);
                return null;
            }

            // Map OCPIPartnerAdditionalProps to BillDeskCredentials
            const credentials: BillDeskCredentials = {
                API_URL: billDeskConfig.API_URL,
                CLIENT_ID: billDeskConfig.CLIENT_ID,
                SECRET_KEY: billDeskConfig.SECRET_KEY,
                MERCHANT_ID: billDeskConfig.MERCHANT_ID,
            };

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

            logger.info(`BillDesk credentials loaded for partnerId: ${partnerId}`);

            return cacheEntry;
        }
        catch (error: unknown) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.error(`Error in fetching BillDesk credentials`, err, { partnerId });
            return null;
        }
    }
}