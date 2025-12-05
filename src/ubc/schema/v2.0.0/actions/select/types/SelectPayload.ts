import { ObjectType } from "../../../enums/ObjectType";
import { Context } from "../../../types/Context";
import { BecknOrderAttributes } from "../../../types/OrderAttributes";
import { BecknOrderItem } from "../../../types/OrderItem";
import { BecknOrderValue } from "../../../types/OrderValue";

export type UBCSelectRequestPayload = {
    context: Context;
    message: {
        order: UBCSelectOrder;
    };
};

export type UBCSelectOrder = {
    "@context": string;
    "@type": ObjectType.order;
    "beckn:id": string;
    "beckn:orderStatus": string;
    "beckn:seller": string;
    // "beckn:buyer": string;
    "beckn:orderValue": BecknOrderValue;
    "beckn:orderItems": BecknOrderItem[];
    // "beckn:fulfillment": BecknFulfillment;
    "beckn:orderAttributes": BecknOrderAttributes;
};
