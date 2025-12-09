import { ObjectType } from "../../../enums/ObjectType";
import { BecknBuyer } from "../../../types/Buyer";
import { Context } from "../../../types/Context";
import { BecknFulfillment } from "../../../types/Fulfillment";
import { BecknOrderAttributes } from "../../../types/OrderAttributes";
import { BecknOrderItemResponse } from "../../../types/OrderItem";
import { BecknOrderValueResponse } from "../../../types/OrderValue";

export type UBCInitRequestPayload = {
    context: Context,
    message: {
        order: UBCInitOrder,
    },
};

export type UBCInitOrder = {
    "@context": string;
    "@type": ObjectType.order;
    "beckn:id": string;
    "beckn:orderStatus": string;
    "beckn:seller": string;
    "beckn:buyer": BecknBuyer;
    "beckn:orderItems": BecknOrderItemResponse[];
    "beckn:orderValue": BecknOrderValueResponse;
    // "beckn:payment": BecknPayment;
    "beckn:fulfillment": BecknFulfillment;
    "beckn:orderAttributes": BecknOrderAttributes;
}
