import { Context } from "../../../types/Context";
import { UBCOrder } from "../../../types/Order";


export type UBCInitOrder = Omit<UBCOrder, 'beckn:orderNumber' | 'beckn:payment'> & {};

export type UBCInitRequestPayload = {
    context: Context,
    message: {
        order: UBCInitOrder,
    },
};
