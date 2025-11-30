import { BecknOrganization } from "./Organization";
import { ObjectType } from "../enums/ObjectType";
import { Role } from "../enums/Role";

export type BecknBuyer = {
    "@context": string; // e.g. "https://raw.githubusercontent.com/beckn/protocol-specifications-new/refs/heads/draft/schema/core/v2/context.jsonld"
    "@type": ObjectType.buyer;
    "beckn:id": string;
    "beckn:role": Role.BUYER; // e.g. "BUYER"
    "beckn:name"?: string;
    "beckn:address"?: string;
    "beckn:email"?: string;
    "beckn:phone"?: string;
    "beckn:taxId"?: string;
    "beckn:organization"?: BecknOrganization;
};
