import { Context } from "../../../types/Context";
import { UBCOrder } from "../../../types/Order";


export type UBCTrackOrder = Pick<UBCOrder, '@context' | '@type' | 'beckn:id' | 'beckn:orderStatus'> & {};

export type UBCTrackRequestPayload = {
    context: Context,
    message: {
        order: UBCTrackOrder,
    }
};

