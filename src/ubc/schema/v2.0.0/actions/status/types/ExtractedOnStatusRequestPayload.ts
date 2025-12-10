import { BecknPaymentStatus } from "../../../enums/PaymentStatus";

export type ExtractedOnStatusRequestBody = {
    payment_status: BecknPaymentStatus,
    authorization_reference: string,
};
