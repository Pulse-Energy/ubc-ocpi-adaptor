import { Context } from "../../../types/Context";
import { UBCOrder } from "../../../types/Order";


export type UBCSelectOrder = Omit<UBCOrder, 'beckn:orderNumber' | 'beckn:payment' | 'beckn:buyer' | 'beckn:orderAttributes' | 'beckn:price'> & {};

export type UBCSelectRequestPayload = {
    context: Context;
    message: {
        order: UBCSelectOrder;
    };
};