import { ObjectType } from "../enums/ObjectType";

// EV - OfferAttributes (ChargingOffer per provided context/type)
export type BecknOfferAttributes = {
    "@context": string; // context URL
    "@type": ObjectType.chargingOffer;
    buyerFinderFee?: {
        feeType: string; // "PERCENTAGE" etc
        feeValue: number;
    };
    idleFeePolicy?: {
        applicableQuantity: {
            unitCode: string;
            unitQuantity: number;
            unitText: string;
        };
        currency: string;
        value: number;
    };
    tariffModel?: string;
    offerType?: string;
    discountPercentage?: number;
};

