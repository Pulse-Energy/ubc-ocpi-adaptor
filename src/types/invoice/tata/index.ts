export type InvoiceGenerationRequest = {
    session_id: string;
    finder_fee_flat: string;
    finder_fee_percentage: string;
    customer_name: string;
    gst?: string;
    state?: string;
    pincode?: string;
    phone_no?: string;
    customer_id: string;
    address?: string;
}

/**
 * Invoice Data from Tata Power API Response
 */
export type TataPowerInvoiceData = {
    evse_uid: string;
    connector_id: string;
    total_energy_in_kwh: string;
    total_time: string;
    start_date_time: string;
    end_date_time: string;
    rate: string;
    taxable_cost: string;
    cgst_rate_in_per: string;
    cgst_amount_flat: string;
    sgst_rate_in_per: string;
    sgst_amount_flat: string;
    igst_rate_in_per: string;
    igst_amount_flat: string;
    total_cost: string;
    finder_fees: string;
}

/**
 * Tata Power API Response Interface
 */
export type TataPowerInvoiceApiResponse = {
    status: boolean;
    message: string;
    invoice_url: string;
    timestamp: string;
    invoice_data: TataPowerInvoiceData;
}

/**
 * Invoice Generation Response Interface
 */
export type InvoiceGenerationResponse = {
    success: boolean;
    invoice_url?: string;
    message?: string;
    error?: string;
    timestamp?: string;
    invoice_data?: TataPowerInvoiceData;
}