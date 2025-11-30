import { Context } from "../../../types/Context";
import { UBCOrder } from "../../../types/Order";


export type UBCOnInitOrder = Omit<UBCOrder, 'beckn:orderNumber' | 'beckn:payment'> & {};

export type UBCOnInitRequestPayload = {
    context: Context;
    message: {
        order: UBCOnInitOrder;
    };
};