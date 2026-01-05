import { OrderStatus } from "../../../enums/OrderStatus";
import { Context } from "../../../types/Context";
import { BecknOrderItemResponse } from "../../../types/OrderItem";
import { ObjectType } from "../../../enums/ObjectType";
import { BecknOrderValueResponse } from "../../../types/OrderValue";
import { BecknOrderAttributes } from "../../../types/OrderAttributes";

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
    "beckn:buyer"?: any; // Optional - present in schema example
    "beckn:orderValue": BecknOrderValueResponse;
    "beckn:orderItems": BecknOrderItemResponse[];
    "beckn:orderAttributes": BecknOrderAttributes;
    // Per schema: on_select should NOT include beckn:fulfillment
};
