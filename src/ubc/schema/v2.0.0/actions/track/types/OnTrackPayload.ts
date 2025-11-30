import { Context } from "../../../types/Context";
import { UBCOrder } from "../../../types/Order";


export type UBCOnTrackOrder = Omit<UBCOrder, 'beckn:orderNumber' | 'beckn:payment' | 'beckn:seller' | 'beckn:buyer' | 'beckn:orderValue' | 'beckn:orderAttributes'> & {};

export type UBCOnTrackRequestPayload = {
    context: Context,
    message: {
        order: UBCOnTrackOrder
    },
}
