/**
 * Service charge structure stored in payment_txn.service_charge
 * Contains finder fee percentages
 */
export type ServiceCharge = {
    buyer_finder_fee?: {
        feeType?: string;
        feeValue?: number;
    };
    network_fee?: number;      // Percentage (e.g., 0.3 for 0.3%)
};

