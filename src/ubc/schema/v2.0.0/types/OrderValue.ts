import { OrderValueComponentsType } from "../enums/OrderValueComponentsType";

// OrderValue
export type BecknOrderValue = {
    currency: string;   // e.g., "INR"
    value: number;      // e.g., 100.0
};

export type BecknOrderValueComponents = {
    type: OrderValueComponentsType;
    value: number;
    currency: string;
    description: string;
};

export type BecknOrderValueResponse = {
    currency: string;
    value: number;
    components: Array<BecknOrderValueComponents>;
};

export type GSTBreakup = {
    gst_on_charging_session_cost?: number, // GST on Charging Session Cost
    gst_on_pg_processing_fee?: number, // GST on PG Processing Fee
    gst_on_buyer_finder_fee?: number, // GST on UBC Buyer Finder Fee
    gst_on_network_finder_fee?: number, // GST on UBC Network Finder Fee
};
