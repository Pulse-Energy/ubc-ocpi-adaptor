export type InvoiceGenerationRequest = {
    customer_name: string;
    gst?: string;
    charge_session_id: string;
    state?: string;
    pincode?: string;
    phone_no?: string;
    customer_id: string;
    address?: string;
}

/**
 * Tata Power API Response Interface
 */
export type TataPowerInvoiceApiResponse = {
    message: string;
    invoice_url: string;
    status: string;
    timestamp: string;
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
    raw_response?: TataPowerInvoiceApiResponse;
}