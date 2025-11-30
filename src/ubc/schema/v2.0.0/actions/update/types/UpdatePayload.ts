import { Context } from "../../../types/Context";
import { UBCOrder } from "../../../types/Order";

export type UBCUpdateOrder = UBCOrder;

export type UpdateMessage = {
    update_target?: string;
    order: UBCUpdateOrder;
};

export type UBCUpdateRequestPayload = {
    context: Context,
    message: UpdateMessage,
};
