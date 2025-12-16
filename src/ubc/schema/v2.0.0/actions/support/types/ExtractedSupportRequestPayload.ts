import { BecknDomain } from "../../../enums/BecknDomain";
export type ExtractedSupportRequestPayload = {
    metadata: {
        domain: BecknDomain,
        bpp_id?: string,
        bpp_uri?: string,
        beckn_transaction_id?: string,
    },
    payload: {
        reference_id: string;
        reference_type: string;
    },
};

