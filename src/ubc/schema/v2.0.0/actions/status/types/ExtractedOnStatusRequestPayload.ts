import { BecknDomain } from "../../../enums/BecknDomain";
import { BecknPaymentStatus } from "../../../enums/PaymentStatus";

export type ExtractedOnStatusRequestBody = {
    metadata: {
        domain: BecknDomain,
        bap_id: string,
        bap_uri: string,
        beckn_transaction_id: string,
    },
    payload: {
        payment_status: BecknPaymentStatus,
    },
};
