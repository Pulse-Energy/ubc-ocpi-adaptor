import { Context } from "../../../types/Context";

export type UBCSupportRequestPayload = {
    context: Context,
    message: {
        ref_id: string;
        ref_type: string;
    }
};

