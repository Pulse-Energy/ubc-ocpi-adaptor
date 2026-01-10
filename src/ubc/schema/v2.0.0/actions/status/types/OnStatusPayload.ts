import { ObjectType } from "../../../enums/ObjectType";
import { BecknBuyer, BecknBuyerMinimal } from "../../../types/Buyer";
import { Context } from "../../../types/Context";
import { BecknFulfillment } from "../../../types/Fulfillment";
import { BecknOrderItemResponse } from "../../../types/OrderItem";
import { BecknOrderValueResponse } from "../../../types/OrderValue";
import { BecknPayment } from "../../../types/Payment";

export type UBCOnStatusRequestPayload = {
    context: Context;
    message: {
        order: UBCOnStatusOrder
    };
};

export type UBCOnStatusOrder = {
    "@context": string;
    "@type": ObjectType.order;
    "beckn:id": string;
    "beckn:orderStatus": string;
    "beckn:seller": string;
    "beckn:buyer": BecknBuyer | BecknBuyerMinimal; // Full buyer for sync, minimal (only id) for async
    "beckn:orderValue": BecknOrderValueResponse;
    "beckn:orderItems": BecknOrderItemResponse[];
    "beckn:fulfillment": BecknFulfillment; // Required per schema (lines 2091-2104 for sync, 5690-5700 for async)
    "beckn:payment": BecknPayment;
    // Per schema: orderAttributes and orderNumber are NOT present in on_status
};
