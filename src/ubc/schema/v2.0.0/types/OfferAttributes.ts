import { ObjectType } from "../enums/ObjectType";

// EV - OfferAttributes (ChargingOffer per provided context/type)
export type BecknOfferAttributes = {
    "@context": string; // context URL
    "@type": ObjectType.chargingOffer;
    buyerFinderFee: {
        feeType: string; // "PERCENTAGE" etc
        feeValue: number;
    };
    idleFeePolicy?: string;
    offerType?: string;
    discountPercentage?: number;
};

