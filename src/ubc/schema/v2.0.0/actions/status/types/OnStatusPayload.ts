import { ObjectType } from "../../../enums/ObjectType";
import { BecknBuyer } from "../../../types/Buyer";
import { Context } from "../../../types/Context";
import { BecknFulfillment } from "../../../types/Fulfillment";
import { BecknOrderAttributes } from "../../../types/OrderAttributes";
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
    "beckn:buyer": BecknBuyer;
    "beckn:orderValue": BecknOrderValueResponse;
    "beckn:orderItems": BecknOrderItemResponse[];
    "beckn:fulfillment": BecknFulfillment;
    "beckn:orderAttributes": BecknOrderAttributes;
    "beckn:payment": BecknPayment;
    "beckn:orderNumber": string;
};
