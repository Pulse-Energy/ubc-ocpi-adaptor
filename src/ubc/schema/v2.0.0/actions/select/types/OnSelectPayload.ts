import { Context } from "../../../types/Context";
import { UBCOrder } from "../../../types/Order";


export type UBCOnSelectOrder = Omit<UBCOrder, 'beckn:orderNumber' | 'beckn:payment' | 'beckn:buyer' | 'beckn:orderAttributes' | 'beckn:price'> & {};

export type UBCOnSelectRequestPayload = {
    context: Context;
    message: {
        order: UBCOnSelectOrder;
    };
};