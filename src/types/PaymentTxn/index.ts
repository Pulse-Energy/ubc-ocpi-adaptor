import { BillDeskCreateOrderResponse, PaymentSDK } from "../BillDesk";

/**
 * Additional properties stored with a payment transaction
 */
export type PaymentTxnAdditionalProps = {
    /** When the payment was received */
    payment_received_at?: string;
    payment_sdk?: PaymentSDK;
    org_id?: string;
    order_id?: string;
    app_variant?: string;
    refund_amount?: string;
    payment_gateway_create_object?: BillDeskCreateOrderResponse;
};
