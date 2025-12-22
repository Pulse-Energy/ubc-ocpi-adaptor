import { BecknCatalog } from "../../../types/Catalog";
import { Context } from "../../../types/Context";


export type UBCPublishRequestPayload = {
    context: Context;
    catalogs: BecknCatalog[];
};

