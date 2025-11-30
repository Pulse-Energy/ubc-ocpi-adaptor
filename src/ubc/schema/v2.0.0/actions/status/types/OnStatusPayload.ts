import { Context } from "../../../types/Context";
import { UBCOrder } from "../../../types/Order";


export type UBCOnStatusOrder = UBCOrder;

export type UBCOnStatusRequestPayload = {
    context: Context;
    message: {
        order: UBCOnStatusOrder
    };
};