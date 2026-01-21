import { GenericPaymentTxnStatus } from "../../../../../../types/BillDesk";
import { BecknPaymentStatus } from "../../../enums/PaymentStatus";

export type ExtractedOnStatusRequestBody = {
    payment_status: string,
    authorization_reference: string,
    oldPaymentStatus: GenericPaymentTxnStatus,
    amount?: number,
};
