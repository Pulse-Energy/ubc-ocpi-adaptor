import { Context } from "vm";
import { UBCOrder } from "../../../types/Order";

export type UBCOnConfirmOrder = UBCOrder;

export type UBCOnConfirmRequestPayload = {
    context: Context;
    message: {
        order: UBCOnConfirmOrder;
    };
};
