import { Context } from "vm";
import { UBCOrder } from "../../../types/Order";

export type UBCConfirmOrder = UBCOrder;

export type UBCConfirmRequestPayload = {
    context: Context,
    message: {
        order: UBCConfirmOrder,
    },
};
