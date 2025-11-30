
import { Support } from "../../../types/Support";
import { Context } from "../../../types/Context";


export type OnSupportMessage = {
    support: Support
};

export type UBCOnSupportRequestPayload = {
    context: Context,
    message: OnSupportMessage,
};

