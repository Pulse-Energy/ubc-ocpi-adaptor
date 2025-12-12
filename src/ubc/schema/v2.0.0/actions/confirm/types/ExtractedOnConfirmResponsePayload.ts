import { BecknDomain } from "../../../enums/BecknDomain";
import { OrderStatus } from "../../../enums/OrderStatus";

export type ExtractedOnConfirmResponsePayload = {
    order_status: OrderStatus,
    payment_received_at?: string,
};

export type ExtractedOnConfirmResponseBody = {
    metadata: {
        domain: BecknDomain,
    },
    payload: ExtractedOnConfirmResponsePayload,
};
