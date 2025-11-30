import { BecknTimePeriod } from "./TimePeriod";
import { BecknDescriptor } from "./Descriptor";
import { BecknItem } from "./Item";
import { BecknCatalogOffer } from "./CatalogOffer";

// Catalog type
export type BecknCatalog = {
    "@context": string;
    "@type": "beckn:Catalog";
    "beckn:id": string;
    "beckn:descriptor": BecknDescriptor;
    "beckn:providerId"?: string;
    "beckn:validity": BecknTimePeriod;
    "beckn:items": BecknItem[];
    "beckn:offers": BecknCatalogOffer[];
};

