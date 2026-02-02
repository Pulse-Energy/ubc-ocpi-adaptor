import { BecknOrderValueResponse, BecknOrderValueComponents } from '../schema/v2.0.0/types/OrderValue';
import { OrderValueComponentsType } from '../schema/v2.0.0/enums/OrderValueComponentsType';
import { FinalAmount } from '../types/FinalAmount';
import { ServiceCharge } from '../types/ServiceCharge';

// OCPIPrice type for CDR total_cost
type OCPIPrice = {
    excl_vat: number;
    incl_vat?: number;
};

/**
 * Calculates the final amount breakdown using the standard logic:
 * - charging_session_cost = provided input
 * - gst = provided input
 * - buyer_finder_fee = charging_session_cost * buyerFinderFeePercent%
 * - network_finder_fee = charging_session_cost * networkFinderFeePercent%
 * - total = charging_session_cost + gst + buyer_finder_fee + network_finder_fee
 * 
 * @param chargingSessionCost - Base charging session cost (excl VAT)
 * @param gst - GST amount
 * @param buyerFinderFeePercent - Buyer finder fee percentage (default: 0.9)
 * @param networkFinderFeePercent - Network finder fee percentage (default: 0.3)
 */
export function calculateFinalAmount(
    chargingSessionCost: number,
    gst: number,
    buyerFinderFee?: {
        feeType?: string;
        feeValue?: number;
    },
    networkFinderFeePercent: number = 0.3
): FinalAmount {
    let buyerFinderCost: number;
    if (buyerFinderFee?.feeType === 'AMOUNT' && buyerFinderFee.feeValue !== undefined && buyerFinderFee.feeValue >=0 ) {
        buyerFinderCost = buyerFinderFee.feeValue;
    } 
    else if (buyerFinderFee?.feeType === 'PERCENTAGE' && buyerFinderFee.feeValue !== undefined && buyerFinderFee.feeValue>=0) {
        buyerFinderCost = chargingSessionCost * (buyerFinderFee.feeValue / 100);
    } 
    else {
        buyerFinderCost = chargingSessionCost * (0.9 / 100);
    }   

    if (!networkFinderFeePercent) {
        networkFinderFeePercent = 0.3;
    }

    const networkFinderFee = chargingSessionCost * (networkFinderFeePercent / 100);
    const total = chargingSessionCost + gst + buyerFinderCost + networkFinderFee;

    return {
        charging_session_cost: chargingSessionCost,
        gst: gst,
        buyer_finder_fee: buyerFinderCost,
        network_finder_fee: networkFinderFee,
        total: total,
    };
}

/**
 * Builds order value response from final amount breakdown
 */
export function buildOrderValueFromFinalAmount(
    finalAmount: FinalAmount,
    currency: string
): BecknOrderValueResponse {
    const components: BecknOrderValueComponents[] = [];

    // Charging session cost
    components.push({
        type: OrderValueComponentsType.UNIT,
        value: finalAmount.charging_session_cost,
        currency: currency,
        description: 'Charging session cost',
    });

    // Buyer finder fee
    components.push({
        type: OrderValueComponentsType.FEE,
        value: finalAmount.buyer_finder_fee,
        currency: currency,
        description: 'Buyer finder fee',
    });

    // Network finder fee
    components.push({
        type: OrderValueComponentsType.FEE,
        value: finalAmount.network_finder_fee,
        currency: currency,
        description: 'Network finder fee',
    });

    // GST
    components.push({
        type: OrderValueComponentsType.TAX,
        value: finalAmount.gst,
        currency: currency,
        description: 'GST',
    });

    const feeAmountInPaise = Math.ceil(0.2 * (finalAmount.total*100) / 100) + 2 * Math.round(9 * Math.ceil(0.2 * (finalAmount.total*100) / 100) / 100);
    const feeAmount = feeAmountInPaise / 100;
    
    components.push({
        type: OrderValueComponentsType.FEE,
        value: feeAmount,
        currency: currency,
        description: 'Payment processing fee',
    });

    return {
        currency: currency,
        value: finalAmount.total + feeAmount,
        components: components,
    };
}

/**
 * Calculates final amount from CDR total_cost (OCPIPrice format)
 * Optionally accepts service charge percentages from payment_txn
 */
export function calculateFinalAmountFromCDR(
    totalCost: OCPIPrice,
    serviceCharge?: ServiceCharge | null,
): FinalAmount {
    const chargingSessionCost = totalCost.excl_vat;
    const gst = totalCost.incl_vat ? (totalCost.incl_vat - totalCost.excl_vat) : 0;
    return calculateFinalAmount(chargingSessionCost, gst, serviceCharge?.buyer_finder_fee, serviceCharge?.network_fee);
}

