import { BuyerFinderFeeEnum } from "../enums/buyerFinderFeeEnum";

export type BuyerFinderFee = {
    feeType: BuyerFinderFeeEnum;
    feeValue: number;
}