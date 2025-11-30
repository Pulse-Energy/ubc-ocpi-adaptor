import { ObjectType } from "../enums/ObjectType";
import { BecknOrderAttributes } from "./OrderAttributes";

// Fulfillment
export type BecknFulfillment = {
    "@context": string;
    "@type": ObjectType.fulfillment;
    "beckn:id": string;
    "beckn:mode": string;
    "beckn:deliveryAttributes": BecknOrderAttributes;
};
