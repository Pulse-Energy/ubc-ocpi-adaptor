import { BecknAcceptedOffer } from "./AcceptedOffer";
import { BecknOfferPrice } from "./OfferPrice";
import { Quantity } from "./Quantity";

// OrderItem
export type BecknOrderItem = {
    "beckn:lineId": string;
    "beckn:orderedItem": string;
    "beckn:quantity": Quantity; // e.g., 2.5
    "beckn:acceptedOffer": BecknAcceptedOffer;
};

export type BecknOrderItemResponse = {
    "beckn:lineId": string;
    "beckn:orderedItem": string;
    "beckn:quantity": Quantity; // e.g., 2.5
    "beckn:acceptedOffer": BecknAcceptedOffer;
    "beckn:price"?: BecknOfferPrice;
};
