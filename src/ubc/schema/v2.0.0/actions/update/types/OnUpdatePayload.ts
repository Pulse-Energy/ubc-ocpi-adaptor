import { Context } from "../../../types/Context";
import { UBCOrder } from "../../../types/Order";

export type UBCOnUpdateOrder = UBCOrder;

export type UBCOnUpdateRequestPayload = {
    context: Context;
    message: {
        order: UBCOnUpdateOrder;
    };
};