import { OrderStatus } from "../../../enums/OrderStatus";
import { Context } from "../../../types/Context";
import { BecknOrderItemResponse } from "../../../types/OrderItem";
import { ObjectType } from "../../../enums/ObjectType";
import { BecknOrderValueResponse } from "../../../types/OrderValue";
import { BecknFulfillment } from "../../../types/Fulfillment";

export type UBCOnSelectRequestPayload = {
    context: Context;
    message: {
        order: UBCOnSelectOrder;
    };
};

export type UBCOnSelectOrder = {
    "@context": string;
    "@type": ObjectType.order;
    "beckn:id": string;
    "beckn:orderStatus": OrderStatus;
    "beckn:seller": string;
    // "beckn:buyer": string;
    "beckn:orderValue": BecknOrderValueResponse;
    "beckn:orderItems": BecknOrderItemResponse[];
    // "beckn:price": BecknOfferPrice;
    "beckn:fulfillment": BecknFulfillment;
    // "beckn:orderAttributes": BecknOrderAttributes;
};
