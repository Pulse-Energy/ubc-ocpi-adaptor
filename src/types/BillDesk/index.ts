/**
 * BillDesk Payment Gateway Types
 * Based on BillDesk API Documentation:
 * - https://docs.billdesk.io/docs/neo-full-redirect
 * - https://docs.billdesk.io/reference/createorder
 * - https://docs.billdesk.io/reference/createrefund
 * - https://docs.billdesk.io/reference/retrieverefund
 * - https://docs.billdesk.io/reference/post-payments-v1_2-transactions-get
 */

// ============ Enums ============

export enum BillDeskTransactionStatus {
    Success = '0300',
    Failed = '0399',
    Pending = '0002',
    UserDropped = '0001',
    Invalid = 'NA',
}

export enum BillDeskRefundStatus {
    Success = 'refund_successful',
    Pending = 'refund_pending',
    Failed = 'refund_failed',
    Initiated = 'refund_initiated',
}

export enum BillDeskOrderStatus {
    Active = 'ACTIVE',
    Completed = 'COMPLETED',
    Expired = 'EXPIRED',
}

export enum BillDeskPaymentMethodType {
    NetBanking = 'netbanking',
    Card = 'card',
    UPI = 'upi',
    Wallet = 'wallet',
}

// ============ Credentials ============

export interface BillDeskCredentials {
    /** BillDesk Client ID */
    CLIENT_ID: string;
    /** Key ID for JWT headers (used in both JWE and JWS headers) */
    KEY_ID: string;
    /** Signing key/password for JWS (HS256) - used to sign encrypted requests */
    SECRET_KEY: string;
    /** Encryption key/password for JWE (A256GCM) - used to encrypt/decrypt API requests */
    ENCRYPTION_KEY: string;
    /** BillDesk Merchant ID */
    MERCHANT_ID: string;
    /** BillDesk API URL (UAT: https://uat1.billdesk.com/u2, Prod: https://api.billdesk.com) */
    API_URL: string;
    PROXY_HOST?: string;
    PROXY_PORT?: string;
    CALLBACK_URL?: string;
    RETURN_URL?: string;
}

// ============ Additional Info ============

export interface BillDeskAdditionalInfo {
    additional_info1?: string;
    additional_info2?: string;
    additional_info3?: string;
    additional_info4?: string;
    additional_info5?: string;
    additional_info6?: string;
    additional_info7?: string;
}

// ============ Create Order (Payment Link) ============

export interface BillDeskCreateOrderRequest {
    /** Unique identifier provided by BillDesk for each merchant */
    mercid: string;
    /** Merchant's unique order identifier (max 35 chars, alphanumeric) */
    orderid: string;
    /** Transaction amount in decimal format (e.g., "100.00") */
    amount: string;
    /** Date and time of order creation in ISO 8601 format */
    order_date: string;
    /** Currency code (356 for INR) */
    currency: string;
    /** Return URL where customer is redirected after payment */
    ru: string;
    /** Additional information fields */
    additional_info?: BillDeskAdditionalInfo;
    /** Item code (usually "DIRECT") */
    itemcode: string;
    /** Device information */
    device?: {
        /** Browser accept header */
        accept_header?: string;
        /** Customer's browser user agent */
        user_agent?: string;
        /** Customer's IP address */
        ip?: string;
        /** Screen height */
        height?: string;
        /** Screen width */
        width?: string;
        /** Screen color depth */
        color_depth?: string;
        /** Timezone offset */
        time_zone?: string;
        /** Browser language */
        language?: string;
        /** Java enabled flag */
        java_enabled?: boolean;
        /** JavaScript enabled flag */
        javascript_enabled?: boolean;
        /** Init channel */
        init_channel?: string;
    };
}

export interface BillDeskOrderLink {
    href: string;
    rel: string;
    method: string;
    parameters?: {
        mercid?: string;
        bdorderid?: string;
        rdata?: string;
    };
    valid_date?: string;
    headers?: {
        authorization?: string;
    };
}

export interface BillDeskCreateOrderResponse {
    /** Object type - "order" */
    objectid: string;
    /** Merchant's order ID */
    orderid: string;
    /** BillDesk generated order ID */
    bdorderid: string;
    /** Merchant ID */
    mercid: string;
    /** Order creation date */
    order_date: string;
    /** Transaction amount */
    amount: string;
    /** Currency code */
    currency: string;
    /** Return URL */
    ru: string;
    /** Additional information */
    additional_info?: BillDeskAdditionalInfo;
    /** Item code */
    itemcode: string;
    /** Created timestamp */
    createdon: string;
    /** Next step - typically "redirect" */
    next_step: string;
    /** Links for redirection */
    links: BillDeskOrderLink[];
    /** Order status */
    status: BillDeskOrderStatus;
}

// ============ Retrieve Transaction ============

export interface BillDeskRetrieveTransactionRequest {
    /** Merchant ID */
    mercid: string;
    /** Merchant's order ID */
    orderid?: string;
    /** BillDesk transaction ID (alternative to orderid) */
    transactionid?: string;
}

export interface BillDeskRetrieveTransactionResponse {
    /** Object type - "transaction" */
    objectid: string;
    /** Merchant ID */
    mercid: string;
    /** Merchant's order ID */
    orderid: string;
    /** BillDesk order ID */
    bdorderid?: string;
    /** BillDesk transaction ID */
    transactionid: string;
    /** Transaction date and time */
    transaction_date: string;
    /** Payment method type (netbanking, card, upi, wallet) */
    payment_method_type: BillDeskPaymentMethodType | string;
    /** Transaction amount */
    amount: string;
    /** Surcharge amount */
    surcharge?: string;
    /** Discount amount */
    discount?: string;
    /** Total charged amount */
    charge_amount: string;
    /** Currency code */
    currency: string;
    /** Return URL */
    ru: string;
    /** Additional information */
    additional_info?: BillDeskAdditionalInfo;
    /** Item code */
    itemcode: string;
    /** Authorization status code */
    auth_status: BillDeskTransactionStatus | string;
    /** Transaction error type */
    transaction_error_type: string;
    /** Transaction error code */
    transaction_error_code: string;
    /** Transaction error description */
    transaction_error_desc: string;
    /** Transaction processing type */
    txn_process_type?: string;
    /** Bank ID */
    bankid?: string;
    /** Payment category */
    payment_category?: string;
}

// ============ Create Refund ============

export interface BillDeskRefundRequest {
    /** Merchant ID */
    mercid: string;
    /** BillDesk transaction ID of the original transaction */
    transactionid: string;
    /** Merchant's unique refund reference number */
    merc_refund_ref_no: string;
    /** Refund amount */
    refund_amount: string;
    /** Currency code (356 for INR) */
    currency: string;
    /** Refund reason */
    txn_date?: string;
}

export interface BillDeskRefundResponse {
    /** Object type - "refund" */
    objectid: string;
    /** Merchant ID */
    mercid: string;
    /** Original order ID */
    orderid?: string;
    /** BillDesk transaction ID */
    transactionid: string;
    /** BillDesk refund ID */
    refundid: string;
    /** Merchant's refund reference number */
    merc_refund_ref_no: string;
    /** Refund amount */
    refund_amount: string;
    /** Currency code */
    currency: string;
    /** Refund status */
    refund_status: BillDeskRefundStatus | string;
    /** Refund creation date */
    createdon?: string;
    /** Refund error code */
    refund_error_code?: string;
    /** Refund error description */
    refund_error_desc?: string;
}

// ============ Retrieve Refund ============

export interface BillDeskRetrieveRefundRequest {
    /** Merchant ID */
    mercid: string;
    /** Merchant's refund reference number (alternative to refundid) */
    merc_refund_ref_no?: string;
    /** BillDesk refund ID (alternative to merc_refund_ref_no) */
    refundid?: string;
}

// Retrieve Refund Response uses the same structure as BillDeskRefundResponse

// ============ Callback/Webhook ============

export interface BillDeskCallbackPayload {
    /** Merchant ID (for UPI callbacks) */
    mercid?: string;
    /** Terminal state */
    terminal_state?: string;
    /** Order ID (for UPI callbacks) */
    orderid?: string;
    /** BillDesk encrypted response */
    bdcres?: string;
    /** Encrypted transaction response (for redirect callbacks) */
    transaction_response?: string;
    /** Return URL */
    return_url?: string;
    /** Message for pipe-separated callbacks */
    msg?: string;
}

export interface BillDeskCallbackDecodedResponse {
    /** Object type - "transaction" */
    objectid: string;
    /** Merchant ID */
    mercid: string;
    /** Merchant's order ID */
    orderid: string;
    /** BillDesk order ID */
    bdorderid?: string;
    /** BillDesk transaction ID */
    transactionid?: string;
    /** Transaction date and time */
    transaction_date?: string;
    /** Payment method type */
    payment_method_type?: BillDeskPaymentMethodType | string;
    /** Transaction amount */
    amount: string;
    /** Surcharge amount */
    surcharge?: string;
    /** Discount amount */
    discount?: string;
    /** Total charged amount */
    charge_amount?: string;
    /** Currency code */
    currency: string;
    /** Return URL */
    ru?: string;
    /** Additional information */
    additional_info?: BillDeskAdditionalInfo;
    /** Item code */
    itemcode?: string;
    /** Authorization status code */
    auth_status: BillDeskTransactionStatus | string;
    /** Transaction error type */
    transaction_error_type?: string;
    /** Transaction error code */
    transaction_error_code?: string;
    /** Transaction error description */
    transaction_error_desc?: string;
    /** Transaction processing type */
    txn_process_type?: string;
    /** Bank ID */
    bankid?: string;
    /** Payment category */
    payment_category?: string;
}

// ============ Payment Link Response ============

export interface BillDeskPaymentLinkData {
    /** The redirect URL for the payment page */
    payment_url: string;
    /** BillDesk order ID */
    bd_order_id: string;
    /** Merchant order ID */
    order_id: string;
    /** The rdata parameter for form submission */
    rdata: string;
    /** Merchant ID */
    merchant_id: string;
    /** Expiry time for the payment link */
    valid_until: string;
}

// ============ Payment Status Mapping ============

export enum GenericPaymentTxnStatus {
    Pending = 'PENDING',
    Success = 'SUCCESS',
    Failed = 'FAILED',
    Refunded = 'REFUNDED',
    PartiallyRefunded = 'PARTIALLY_REFUNDED',
}

export const mapBillDeskStatusToGeneric = (authStatus: string): GenericPaymentTxnStatus => {
    switch (authStatus) {
        case BillDeskTransactionStatus.Success:
            return GenericPaymentTxnStatus.Success;
        case BillDeskTransactionStatus.Failed:
            return GenericPaymentTxnStatus.Failed;
        case BillDeskTransactionStatus.Pending:
        case BillDeskTransactionStatus.UserDropped:
            return GenericPaymentTxnStatus.Pending;
        default:
            return GenericPaymentTxnStatus.Pending;
    }
};

export type BillDeskPaymentServiceProps = {
    bill_desk_device: Device,
    return_url: string,
};

export type Device = {
    init_channel: string;
    ip: string;
    user_agent: string;
    accept_header: string;
    fingerprintid: string;
    browser_tz: string;
    browser_color_depth: string;
    browser_java_enabled: string;
    browser_screen_height: string;
    browser_screen_width: string;
    browser_language: string;
    browser_javascript_enabled: string;
};

// ============ BillDesk Object (for redirect links) ============

export interface BillDeskObject {
    href: string;
    rel: string;
    method: string;
    parameters?: {
        mercid?: string;
        bdorderid?: string;
        rdata?: string;
    };
    valid_date?: string;
    headers?: {
        authorization?: string;
    };
    /** Payment URL for redirect */
    payment_url?: string;
    /** Authorization reference */
    authorization_reference?: string;
}

// ============ Transaction Auth Status ============

export enum BillDeskTransactionAuthStatus {
    SUCCESS = '0300',
    FAILED = '0399',
    PENDING = '0002',
    USER_DROPPED = '0001',
}

// ============ Payment SDK Enum ============

// ============ Create Payment Link ============
// Reference: https://docs.billdesk.io/reference/create-link

export interface BillDeskCreateLinkRequest {
    /** Merchant ID */
    mercid: string;
    /** Unique Link reference number (max 35 chars) */
    linkrefno: string;
    /** Transaction amount in decimal format (e.g., "100.00") */
    amount: string;
    /** Currency code (356 for INR) */
    currency: string;
    /** Link expiry date in ISO 8601 format */
    link_expiry_date: string;
    /** Customer name */
    customer_name?: string;
    /** Customer email */
    customer_email?: string;
    /** Customer mobile */
    customer_mobile?: string;
    /** Link description */
    link_description?: string;
    /** Return URL after payment */
    ru?: string;
    /** Additional information */
    additional_info?: BillDeskAdditionalInfo;
    /** Dissemination mode: EMAIL, SMS, or BOTH */
    dissemination_mode?: 'EMAIL' | 'SMS' | 'BOTH';
    /** Invoice number */
    invoice_no?: string;
    /** Invoice date */
    invoice_date?: string;
}

export interface BillDeskCreateLinkResponse {
    /** Object type - "link" */
    objectid: string;
    /** Merchant ID */
    mercid: string;
    /** Link reference number */
    linkrefno: string;
    /** BillDesk generated link ID */
    bdlinkid: string;
    /** Transaction amount */
    amount: string;
    /** Currency code */
    currency: string;
    /** Link expiry date */
    link_expiry_date: string;
    /** Customer name */
    customer_name?: string;
    /** Customer email */
    customer_email?: string;
    /** Customer mobile */
    customer_mobile?: string;
    /** Link description */
    link_description?: string;
    /** Created timestamp */
    createdon: string;
    /** Link status: ACTIVE, EXPIRED, PAID, CANCELLED */
    status: 'ACTIVE' | 'EXPIRED' | 'PAID' | 'CANCELLED';
    /** Payment link URL that can be shared with customer */
    link_url: string;
    /** Short link URL */
    short_link_url?: string;
    /** Additional information */
    additional_info?: BillDeskAdditionalInfo;
}

// ============ Retrieve Payment Link ============
// Reference: https://docs.billdesk.io/reference/retrieve-link

export interface BillDeskRetrieveLinkRequest {
    /** Merchant ID */
    mercid: string;
    /** Link reference number (use either linkrefno or bdlinkid) */
    linkrefno?: string;
    /** BillDesk Link ID (use either linkrefno or bdlinkid) */
    bdlinkid?: string;
}

export interface BillDeskRetrieveLinkResponse {
    /** Object type - "link" */
    objectid: string;
    /** Merchant ID */
    mercid: string;
    /** Link reference number */
    linkrefno: string;
    /** BillDesk generated link ID */
    bdlinkid: string;
    /** Transaction amount */
    amount: string;
    /** Currency code */
    currency: string;
    /** Link expiry date */
    link_expiry_date: string;
    /** Customer name */
    customer_name?: string;
    /** Customer email */
    customer_email?: string;
    /** Customer mobile */
    customer_mobile?: string;
    /** Link description */
    link_description?: string;
    /** Created timestamp */
    createdon: string;
    /** Link status: ACTIVE, EXPIRED, PAID, CANCELLED */
    status: 'ACTIVE' | 'EXPIRED' | 'PAID' | 'CANCELLED';
    /** Payment link URL */
    link_url: string;
    /** Short link URL */
    short_link_url?: string;
    /** Additional information */
    additional_info?: BillDeskAdditionalInfo;
    /** Transaction ID if payment was made */
    transactionid?: string;
    /** Order ID if payment was made */
    orderid?: string;
    /** Payment status if payment was made */
    payment_status?: string;
}

export enum PaymentSDK {
    BillDesk = 'BILLDESK',
    Razorpay = 'RAZORPAY',
    Paytm = 'PAYTM',
}

// ============ Payment Additional Props ============

// ============ Create Order Response Type ============

export interface CreateOrderWithBillDeskResponse {
    success: boolean;
    billDeskOrder?: BillDeskCreateOrderResponse;
    billDeskObject?: BillDeskObject;
    error?: string;
}