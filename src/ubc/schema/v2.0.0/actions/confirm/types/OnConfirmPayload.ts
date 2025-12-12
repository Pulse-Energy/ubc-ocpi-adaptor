import { ObjectType } from "../../../enums/ObjectType";
import { OrderStatus } from "../../../enums/OrderStatus";
import { BecknBuyer } from "../../../types/Buyer";
import { Context } from "../../../types/Context";
import { BecknFulfillment } from "../../../types/Fulfillment";
import { BecknOrderAttributes } from "../../../types/OrderAttributes";
import { BecknOrderItemResponse } from "../../../types/OrderItem";
import { BecknOrderValueResponse } from "../../../types/OrderValue";
import { BecknPayment } from "../../../types/Payment";

export type UBCOnConfirmRequestPayload = {
    context: Context;
    message: {
        order: UBCOnConfirmOrder;
    };
};

export type UBCOnConfirmOrder = {
    "@context": string;
    "@type": ObjectType.order;
    "beckn:id": string;
    "beckn:orderStatus": OrderStatus;
    "beckn:orderNumber": string;
    "beckn:seller": string;
    "beckn:buyer": BecknBuyer;
    "beckn:orderItems": BecknOrderItemResponse[];
    "beckn:orderValue": BecknOrderValueResponse;
    "beckn:payment": BecknPayment;
    "beckn:fulfillment": BecknFulfillment;
    "beckn:orderAttributes": BecknOrderAttributes;
}
